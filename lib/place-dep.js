// Given a dep, a node that depends on it, and the edge representing that
// dependency, place the dep somewhere in the node's tree, and all of its
// peer dependencies.
//
// Handles all of the tree updating needed to place the dep, including
// removing replaced nodes, pruning now-extraneous or invalidated nodes,
// and saves a set of what was placed and what needs re-evaluation as
// a result.

const log = require('proc-log')
const CanPlaceDep = require('./can-place-dep.js')
const {
  OK,
  REPLACE,
  KEEP,
  CONFLICT,
} = CanPlaceDep

const gatherDepSet = require('./gather-dep-set.js')

class PlaceDep {
  constructor (options) {
    const {
      dep,
      node,
      edge,
      parent = null,
    } = options
    this.dep = dep
    this.node = node
    this.edge = edge
    this.name = edge.name

    this.parent = parent

    // inherit all these fields from the parent to ensure consistency.
    const {
      preferDedupe,
      force,
      explicitRequests,
      updateNames,
      auditReport,
      legacyBundling,
      depsSeen,
      depsQueue,
    } = parent || options
    Object.assign(this, {
      preferDedupe,
      force,
      explicitRequests,
      updateNames,
      auditReport,
      legacyBundling,
      depsSeen,
      depsQueue,
    })

    this.children = []
    this.parent = parent
    this.peerConflict = null

    this.checks = new Map()
    this.target = null
    this.canPlace = null
    this.placed = []

    this.place()
  }

  place () {
    const {
      edge,
      dep,
      node,
      preferDedupe,
      globalStyle,
      legacyBundling,
      force,
      explicitRequests,
      updateNames,
      checks,
    } = this

    // nothing to do if the edge is fine as it is
    if (edge.to &&
        !edge.error &&
        !explicitRequests.has(edge) &&
        !updateNames.includes(edge.name) &&
        !this.isVulnerable(edge.to))
      return

    // walk up the tree until we hit either a top/root node, or a place
    // where the dep is not a peer dep.
    const start = this.getStartNode()

    let target = null
    let canPlace = null
    let firstPlacement = null
    for (const check of start.ancestry()) {
      // if the current location has a peerDep on it, then we can't place here
      // this is pretty rare to hit, since we always prefer deduping peers.
      const checkEdge = check.edgesOut.get(edge.name)
      if (!check.isTop && checkEdge && checkEdge.peer)
        continue

      const cpd = new CanPlaceDep({
        dep,
        edge,
        node,
        target: check,
        preferDedupe,
      })
      checks.set(check, cpd)

      // we found a place this can go
      // we break when we get the first conflict
      if (cpd.canPlace !== CONFLICT) {
        canPlace = cpd
        target = check
      } else
        break

      // nest packages like npm v1 and v2
      // very disk-inefficient
      if (legacyBundling)
        break


      // when installing globally, or just in global style, we never place
      // deps above the first level.
      if (globalStyle) {
        const rp = check.resolveParent
        if (rp && rp.isProjectRoot)
          break
      }
    }

    // if we can't find a target, that means that the last place checked,
    // and all the places before it, had a conflict.  if we're in --force
    // mode, then the user has explicitly said they're ok with conflicts.
    if (!target) {
      if (!force)
        return this.failPeerConflict()
      // if we're --forcing, then either we have something already found
      // in one of the places checked, which couldn't be removed, or we
      // had a peerOptional that would have been made invalid by placing
      // this dep in that location.
      const current = edge.to
      if (current) {
        target = current.resolveParent || current
        canPlace = checks.get(target)
      } else {
        // take the first one we tried
        for (const [t, cpd] of checks.entries()) {
          target = t
          canPlace = cpd
          break
        }
      }
    }

    this.target = target
    this.canPlace = canPlace

    // now we have a target, a tree of CanPlaceDep results for the peer group,
    // and we are ready to go
    this.placeInTree()
  }

  placeInTree () {
    const {
      dep,
      target,
      canPlace,
      node,
      edge,
    } = this

    log.silly(
      'placeDep',
      target.location || 'ROOT',
      `${dep.name}@${dep.version}`,
      canPlace.description,
      `for: ${node.package._id || node.location}`,
      `want: ${edge.spec || '*'}`
    )

    // if we're placing in the tree with --force, we can get here even though
    // it's a conflict.  Treat it as a KEEP, but warn and move on.
    if (canPlace.selfCanPlace === KEEP || canPlace.selfCanPlace === CONFLICT) {
      if (canPlace.selfCanPlace === CONFLICT)
        this.warnPeerConflict()

      // if we get a KEEP in a update scenario, then we MAY have something
      // already duplicating this unnecessarily!  For example:
      // ```
      // root (dep: y@1)
      // +-- x (dep: y@1.1)
      // |   +-- y@1.1.0 (replacing with 1.1.2, got KEEP at the root)
      // +-- y@1.1.2 (updated already from 1.0.0)
      // ```
      // Now say we do `reify({update:['y']})`, and the latest version is
      // 1.1.2, which we now have in the root.  We'll try to place y@1.1.2
      // first in x, then in the root, ending with KEEP, because we already
      // have it.  In that case, we ought to REMOVE the nm/x/nm/y node, because
      // it is an unnecessary duplicate.
      this.pruneDedupable(target)
      return
    }

    const virtualRoot = dep.parent
    const newDep = this.newDep = new dep.constructor({
      name: dep.name,
      pkg: dep.package,
      resolved: dep.resolved,
      integrity: dep.integrity,
      legacyPeerDeps: this.legacyPeerDeps,
      error: dep.errors[0],
      ...(dep.target ? { target: dep.target, realpath: dep.target.path } : {}),
    })
    this.placed.push(newDep)

    this.oldDep = target.children.get(this.name)
    if (this.oldDep)
      this.replaceOldDep()
    else
      newDep.parent = target

    // if it's an overridden peer dep, warn about it
    if (edge.peer && !newDep.satisfies(edge))
      this.warnPeerConflict()

    // If the edge is not an error, then we're updating something, and
    // MAY end up putting a better/identical node further up the tree in
    // a way that causes an unnecessary duplication.  If so, remove the
    // now-unnecessary node.
    if (edge.valid && edge.to && edge.to !== newDep)
      this.pruneDedupable(edge.to, false)

    /** XXX needed in buildIdealTree after placing
    // visit any dependents who are upset by this change
    // if it's an angry overridden peer edge, however, skip it
    for (const edgeIn of newDep.edgesIn) {
      if (edgeIn !== edge && !edgeIn.valid && !this[_depsSeen].has(edge.from)) {
        this.addTracker('idealTree', edgeIn.from.name, edgeIn.from.location)
        this[_depsQueue].push(edgeIn.from)
      }
    }
    **/

    // in case we just made some duplicates that can be removed,
    // prune anything deeper in the tree that can be replaced by this
    for (const node of dep.root.inventory.query('name', newDep.name)) {
      if (node.isDescendantOf(target))
        this.pruneDedupable(node, false)
    }

    // also place its unmet or invalid peer deps at this location
    // loop through any peer deps from the thing we just placed, and place
    // those ones as well.  it's safe to do this with the virtual nodes,
    // because we're copying rather than moving them out of the virtual root,
    // otherwise they'd be gone and the peer set would change throughout
    // this loop.
    for (const peerEdge of newDep.edgesOut.values()) {
      const peer = virtualRoot.children.get(peerEdge.name)

      // Note: if the virtualRoot *doesn't* have the peer, then that means
      // it's an optional peer dep.  If it's not being properly met (ie,
      // peerEdge.valid is false), then this is likely heading for an
      // ERESOLVE error, unless it can walk further up the tree.
      if (!peerEdge.peer || peerEdge.valid || !peer)
        continue

      const peerPlace = new PlaceDep({
        parent: this,
        dep: peer,
        node: this.dep,
        edge: peerEdge,
      })
      this.placed.push(...peerPlace.placed)
      this.children.push(peerPlace)
    }
  }

  replaceOldDep () {
    // XXX handle replacing an entire peer group?
    // what about cases where we need to push some other peer groups deeper
    // into the tree?  all the tree updating should be done here, and track
    // all the things that we add and remove, so that we can know what
    // to re-evaluate.

    // if we're replacing, we should also remove any nodes for edges that
    // are now invalid, and where this (or its deps) is the only dependent,
    // and also recurse on that pruning.  Otherwise leaving that dep node
    // around can result in spurious conflicts pushing nodes deeper into
    // the tree than needed in the case of cycles that will be removed
    // later anyway.
    const oldDeps = []
    for (const [name, edge] of this.oldDep.edgesOut.entries()) {
      if (!this.newDep.edgesOut.has(name) && edge.to)
        oldDeps.push(...gatherDepSet([edge.to], e => e.to !== edge.to))
    }
    this.newDep.replace(this.oldDep)
    this.pruneForReplacement(this.newDep, oldDeps)

    /** XXX needed in buildIdealTree after placing
    // this may also create some invalid edges, for example if we're
    // intentionally causing something to get nested which was previously
    // placed in this location.
    for (const edgeIn of this.newDep.edgesIn) {
      if (edgeIn.invalid && edgeIn !== edge) {
        // if it's already been visited, we have to re-visit
        // otherwise, just enqueue normally.
        this.depsSeen.delete(edgeIn.from)
        this.depsQueue.push(edgeIn.from)
      }
    }
   **/
  }

  pruneForReplacement (node, oldDeps) {
    // gather up all the invalid edgesOut, and any now-extraneous
    // deps that the new node doesn't depend on but the old one did.
    const invalidDeps = new Set([...node.edgesOut.values()]
      .filter(e => e.to && !e.valid).map(e => e.to))
    for (const dep of oldDeps) {
      const set = gatherDepSet([dep], e => e.to !== dep && e.valid)
      for (const dep of set)
        invalidDeps.add(dep)
    }

    // ignore dependency edges from the node being replaced, but
    // otherwise filter the set down to just the set with no
    // dependencies from outside the set, except the node in question.
    const deps = gatherDepSet(invalidDeps, edge =>
      edge.from !== node && edge.to !== node && edge.valid)

    // now just delete whatever's left, because it's junk
    for (const dep of deps)
      dep.root = null
  }

  // prune all the nodes in a branch of the tree that can be safely removed
  // This is only the most basic duplication detection; it finds if there
  // is another satisfying node further up the tree, and if so, dedupes.
  // Even in legacyBundling mode, we do this amount of deduplication.
  pruneDedupable (node, descend = true) {
    if (node.canDedupe(this.preferDedupe)) {
      node.root = null
      return
    }
    if (descend) {
      // sort these so that they're deterministically ordered
      // otherwise, resulting tree shape is dependent on the order
      // in which they happened to be resolved.
      const nodeSort = (a, b) => a.location.localeCompare(b.location, 'en')

      const children = [...node.children.values()].sort(nodeSort)
      const fsChildren = [...node.fsChildren].sort(nodeSort)
      for (const child of children)
        this.pruneDedupable(child)
      for (const topNode of fsChildren) {
        const children = [...topNode.children.values()].sort(nodeSort)
        for (const child of children)
          this.pruneDedupable(child)
      }
    }
  }

  getStartNode () {
    return deepestNestingTarget(this.peerEntryEdge.from, this.name)
  }

  isVulnerable (node) {
    return this.auditReport && this.auditReport.isVulnerable(node)
  }

  get peerEntryEdge () {
    return this.parent ? this.parent.peerEntryEdge : this.edge
  }

  get isMine () {
    return this.parent ? this.parent.isMine
      : (this.dep.isProjectRoot || this.dep.isWorkspace)
  }
}
