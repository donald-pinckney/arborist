// Given a dep, a node that depends on it, and the edge representing that
// dependency, place the dep somewhere in the node's tree, and all of its
// peer dependencies.
//
// Handles all of the tree updating needed to place the dep, including
// removing replaced nodes, pruning now-extraneous or invalidated nodes,
// and saves a set of what was placed and what needs re-evaluation as
// a result.

const log = require('proc-log')
const deepestNestingTarget = require('./deepest-nesting-target.js')
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
    this.name = edge.name
    this.dep = dep
    this.node = node
    this.edge = edge
    this.canPlace = null

    this.target = null
    this.placed = null

    // inherit all these fields from the parent to ensure consistency.
    const {
      preferDedupe,
      force,
      explicitRequests,
      updateNames,
      auditReport,
      legacyBundling,
      strictPeerDeps,
      // depsSeen,
      // depsQueue,
    } = parent || options
    Object.assign(this, {
      preferDedupe,
      force,
      explicitRequests,
      updateNames,
      auditReport,
      legacyBundling,
      strictPeerDeps,
      // depsSeen,
      // depsQueue,
    })

    this.children = []
    this.parent = parent
    this.peerConflict = null

    this.checks = new Map()

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
    let canPlaceSelf = null
    for (const check of start.ancestry()) {
      // if the current location has a peerDep on it, then we can't place here
      // this is pretty rare to hit, since we always prefer deduping peers.
      const checkEdge = check.edgesOut.get(edge.name)
      console.error('CHECK', dep.package._id, check.path, checkEdge)
      if (!check.isTop && checkEdge && checkEdge.peer) {
        console.error('not top and peer edge, continue checking')
        continue
      }

      const cpd = new CanPlaceDep({
        dep,
        edge,
        node,
        target: check,
        preferDedupe,
      })
      checks.set(check, cpd)
      console.error('check result', cpd.canPlace)

      // It's possible that a "conflict" is a conflict among the *peers* of
      // a given node we're trying to place, but there actually is no current
      // node.  Eg,
      // root -> (a, b)
      // a -> PEER(c)
      // b -> PEER(d)
      // d -> PEER(c@2)
      // We place (a), and get a peer of (c) along with it.
      // then we try to place (b), and get CONFLICT in the check, because
      // of the conflicting peer from (b)->(d)->(c@2).  In that case, we
      // should treat (b) and (d) as OK, and place them in the last place
      // where they did not themselves conflict, and skip c@2 if conflict
      // is ok by virtue of being forced or not ours and not strict.
      if (cpd.canPlaceSelf !== CONFLICT)
        canPlaceSelf = cpd

      // we found a place this can go, along with all its peer friends.
      // we break when we get the first conflict
      if (cpd.canPlace !== CONFLICT) {
        canPlace = cpd
        target = check
      } else {
        console.error('hit conflict', {
          name: this.name,
          node: this.node.path,
          canPlaceSelf: canPlaceSelf && canPlaceSelf.target.path,
          canPlace: canPlace && canPlace.target.path,
          cpd: canPlace || canPlaceSelf,
        })
        break
      }

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
    console.error('target found?', dep.package._id, canPlace && canPlace.canPlace, target && target.path)

    Object.assign(this, {
      canPlace,
      canPlaceSelf,
    })
    this.current = edge.to

    // if we can't find a target, that means that the last place checked,
    // and all the places before it, had a conflict.
    if (!canPlace) {
      console.error('\nno canPlace found', edge)
      // if not forced, or it's our dep, or strictPeerDeps is set, then
      // this is an ERESOLVE error.
      if (!this.conflictOk)
        return this.failPeerConflict()

      // ok!  we're gonna allow the conflict, but we should still warn
      // if we have a current, then we treat CONFLICT as a KEEP.
      // otherwise, we just skip it.  Only warn on the one that actually
      // could not be placed somewhere.
      if (!canPlaceSelf) {
        console.error('no canplaceself found', edge)
        this.warnPeerConflict()
        return
      }

      console.error('will place anyway', canPlaceSelf)
      this.canPlace = canPlaceSelf
    }

    // now we have a target, a tree of CanPlaceDep results for the peer group,
    // and we are ready to go
    this.placeInTree()
  }

  placeInTree () {
    const {
      dep,
      canPlace,
      node,
      edge,
    } = this

    if (!canPlace)
      throw new Error('canPlace not set, but trying to place in tree')

    const { target } = canPlace

    log.silly(
      'placeDep',
      target.location || 'ROOT',
      `${dep.name}@${dep.version}`,
      canPlace.description,
      `for: ${node.package._id || node.location}`,
      `want: ${edge.spec || '*'}`
    )

    const placementType = canPlace.canPlace === CONFLICT
      ? canPlace.canPlaceSelf
      : canPlace.canPlace

    console.error('placement type', placementType)

    if (canPlace.canPlace === CONFLICT)
      console.error('CONFLICT, placing anyway', canPlace)

    // if we're placing in the tree with --force, we can get here even though
    // it's a conflict.  Treat it as a KEEP, but warn and move on.
    if (placementType === KEEP) {
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

    // XXX if we are replacing SOME of a peer entry group, we will need to
    // remove any that are not being replaced and will now be invalid, and
    // re-evaluate them deeper into the tree.

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
    this.placed = newDep

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

    // in case we just made some duplicates that can be removed,
    // prune anything deeper in the tree that can be replaced by this
    for (const node of target.root.inventory.query('name', newDep.name)) {
      if (node.isDescendantOf(target) && !node.isTop)
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

      this.children.push(new PlaceDep({
        parent: this,
        dep: peer,
        node: this.dep,
        edge: peerEdge,
      }))
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

  get conflictOk () {
    return this.force || (!this.isMine && !this.strictPeerDeps)
  }

  get isMine () {
    return this.parent ? this.parent.isMine
      : (this.edge.from.isProjectRoot || this.edge.from.isWorkspace)
  }

  warnPeerConflict () {
    log.warn('PEER CONFLICT', require('util').inspect(this, { depth: Infinity }), {
      isMine: this.isMine,
    })
  }

  failPeerConflict () {
    log.warn('FAILING PEER CONFLICT', require('util').inspect(this, { depth: Infinity }), {
      isMine: this.isMine,
    })
    throw Object.assign(new Error('could not resolve'), { code: 'ERESOLVE' })
  }

  getStartNode () {
    // if we are a peer, then we MUST be at least as shallow as the
    // peer dependent
    const from = this.parent ? this.parent.getStartNode() : this.edge.from
    return deepestNestingTarget(from, this.name)
  }

  get top () {
    return this.parent ? this.parent.top : this
  }

  isVulnerable (node) {
    return this.auditReport && this.auditReport.isVulnerable(node)
  }

  get peerEntryEdge () {
    return this.top.edge
  }

  get isMine () {
    const { top: { node: { isProjectRoot, isWorkspace } } } = this
    return isProjectRoot || isWorkspace
  }
}

module.exports = PlaceDep
