// Internal methods used by buildIdealTree.
// Answer the question: "can I put this dep here?"
//
// IMPORTANT: *nothing* in this class should *ever* modify or mutate the tree
// at all.  The contract here is strictly limited to read operations.  We call
// this in the process of walking through the ideal tree checking many
// different potential placement targets for a given node.  If a change is made
// to the tree along the way, that can cause serious problems!
//
// In order to enforce this restriction, in debug mode, canPlaceDep() will
// snapshot the tree at the start of the process, and then at the end, will
// verify that it still matches the snapshot, and throw an error if any changes
// occurred.
//
// The algorithm is roughly like this:
// - check the node itself:
//   - if there is no version present, and no conflicting edges from target,
//     OK, provided all peers can be placed at or above the target.
//   - if the current version matches, KEEP
//   - if there is an older version present, which can be replaced, then
//     - if satisfying and preferDedupe? KEEP
//     - else: REPLACE
//   - if there is a newer version present, and preferDedupe, REPLACE
//   - if the version present satisfies the edge, KEEP
//   - else: CONFLICT
// - if the node is not in conflict, check each of its peers:
//   - if the peer can be placed in the target, continue
//   - else if the peer can be placed in a parent, and there is no other
//     conflicting version shadowing it, continue
//   - else CONFLICT
// - If the peers are not in conflict, return the original node's value
//
// An exception to this logic is that if the target is the deepest location
// that a node can be placed, and the conflicting node can be placed deeper,
// then we will return REPLACE rather than CONFLICT, and Arborist will queue
// the replaced node for resolution elsewhere.

const consoleError = (...args) => {
  // console.error(...args)
}
const semver = require('semver')
const debug = require('./debug.js')
const peerEntrySets = require('./peer-entry-sets.js')
const deepestNestingTarget = require('./deepest-nesting-target.js')

const CONFLICT = Symbol('CONFLICT')
const OK = Symbol('OK')
const REPLACE = Symbol('REPLACE')
const KEEP = Symbol('KEEP')

class CanPlaceDep {
  // dep is a dep that we're trying to place.  it should already live in
  // a virtual tree where its peer set is loaded as children of the root.
  // target is the actual place where we're trying to place this dep
  // in a node_modules folder.
  // edge is the edge that we're trying to satisfy with this placement.
  // parent is the CanPlaceDep object of the entry node when placing a peer.
  constructor ({ dep, target, edge, preferDedupe, parent = null, peerPath = [] }) {
    consoleError('')
    consoleError('CAN PLACE DEP CTOR', {
    edge,
    parent: parent && [ parent.name, parent.dep.version],
    dep: [dep.name, dep.version],
    target: target.location,
    })
    consoleError('')

    // if (!peerEntryEdge && parent)
    //   peerEntryEdge = parent.top.edge

    debug(() => {
      if (!dep)
        throw new Error('no dep provided to CanPlaceDep')

      if (!target)
        throw new Error('no target provided to CanPlaceDep')

      if (!edge)
        throw new Error('no edge provided to CanPlaceDep')

      // need a parent when checking peer deps, unless it's a peer dep
      // from the root node, as these should always be loaded as a set.
      // if (edge.peer && !parent && !edge.from.isTop) {
      //   const er = new Error('peer edge loaded without entry point')
      //   throw Object.assign(er, {
      //     dep,
      //     target,
      //     edge,
      //     peerPath,
      //   })
      // }

      this._nodeSnapshot = JSON.stringify(dep)
      this._treeSnapshot = JSON.stringify(target.root)
    })

    // the result of whether we can place it or not
    this.canPlace = null
    // if peers conflict, but this one doesn't, then that is useful info
    this.canPlaceSelf = null

    this.dep = dep
    this.target = target
    this.edge = edge
    // preventing cycles when we check peer sets
    this.peerPath = peerPath
    // we always prefer to dedupe peers, because they are trying
    // a bit harder to be singletons.
    this.preferDedupe = !!preferDedupe || edge.peer
    this.parent = parent
    this.children = []

    this.isSource = target === this.peerSetSource
    this.name = edge.name
    this.current = target.children.get(this.name)
    this.targetEdge = target.edgesOut.get(this.name)
    this.conflicts = new Map()

    // check if this dep was already subject to a peerDep override while
    // building the peerSet.
    this.edgeOverride = !dep.satisfies(edge)

    this.canPlace = this.checkCanPlace()
    if (!this.canPlaceSelf)
      this.canPlaceSelf = this.canPlace

    debug(() => {
      const nodeSnapshot = JSON.stringify(dep)
      const treeSnapshot = JSON.stringify(target.root)
      if (this._nodeSnapshot !== nodeSnapshot) {
        throw Object.assign(new Error('dep changed in CanPlaceDep'), {
          expect: this._nodeSnapshot,
          actual: nodeSnapshot,
        })
      }
      if (this._treeSnapshot !== treeSnapshot) {
        throw Object.assign(new Error('tree changed in CanPlaceDep'), {
          expect: this._treeSnapshot,
          actual: treeSnapshot,
        })
      }
    })
  }

  checkCanPlace () {
    const { target, targetEdge, current, dep } = this

    // if the dep failed to load, we're going to fail the build or
    // prune it out anyway, so just move forward placing/replacing it.
    if (dep.errors.length)
      return current ? REPLACE : OK

    // cannot place peers inside their dependents, except for tops
    if (targetEdge && targetEdge.peer && !target.isTop)
      return CONFLICT

    if (targetEdge && !dep.satisfies(targetEdge))
      return CONFLICT

    if (current)
      return this.checkCanPlaceCurrent()
    else
      return this.checkCanPlaceNoCurrent()
  }

  // we know that the target has a dep by this name in its node_modules
  // already.  Can return KEEP, REPLACE, or CONFLICT.
  checkCanPlaceCurrent () {
    consoleError('check can place current', this.target.location, this.name, [this.dep.name, this.dep.version], new Error('trace').stack)
    const { current, target, edge, dep } = this
    // XXX: shouldn't this be REPLACE if it's an explicitRequest?
    if (dep.matches(current)) {
      if (current.satisfies(edge) || this.edgeOverride)
        return KEEP
    }

    const { version: curVer } = current
    const { version: newVer } = dep
    const tryReplace = curVer && newVer && semver.gte(newVer, curVer)
    if (tryReplace && dep.canReplace(current)) {
      consoleError('tryReplace 1')
      /* XXX-istanbul ignore else - It's extremely rare that a replaceable
       * node would be a conflict, if the current one wasn't a conflict,
       * but it is theoretically possible if peer deps are pinned.  In
       * that case we treat it like any other conflict, and keep trying */
      const cpp = this.canPlacePeers(REPLACE)
      if (cpp !== CONFLICT)
        return cpp
    }

    // ok, can't replace the current with new one, but maybe current is ok?
    if (current.satisfies(edge)) {
      return KEEP
    }

    // if we prefer deduping, then try replacing newer with older
    if (this.preferDedupe && !tryReplace && dep.canReplace(current)) {
      consoleError('tryReplace 2')
      const cpp = this.canPlacePeers(REPLACE)
      if (cpp !== CONFLICT)
        return cpp
    }

    // Check for interesting cases!
    // First, is this the deepest place that this thing can go, and NOT the
    // deepest place where the conflicting dep can go?  If so, replace it,
    // and let it re-resolve deeper in the tree.
    const myDeepest = this.deepestNestingTarget

    // ok, i COULD be placed deeper, so leave the current one alone.
    if (target !== myDeepest)
      return CONFLICT

    // if we are not checking a peerDep, then we MUST place it here, in the
    // target that has a non-peer dep on it.
    if (!this.parent && target === edge.from) {
      consoleError('replace because no parent and target is edge.from')
      return this.canPlacePeers(REPLACE)
    }

    // now we have a parent, or it's a peer of a link target,
    // which means we're placing one of the peers in the group.

    const entrySets = peerEntrySets(current)
    OUTER: for (const [entryEdge, peerSet] of entrySets.entries()) {
      consoleError('> check entry set', entryEdge, [...peerSet].map(n => [n.location, n.version]))
      // If the entry edge is the same as peerEntryEdge, then ok,
      // this is the thing we're replacing, so go ahead and replace it.
      if (entryEdge === this.peerEntryEdge) {
        consoleError(' > my edge')
        continue
      }

      // if the entry edge can nest deeper than the target, then it means we
      // can nest it deeper into the tree.  If all of them are like this,
      // then we return REPLACE.
      if (deepestNestingTarget(entryEdge.from, current.name) !== target) {
        consoleError(' >> could nest', current.name)
        // check to see if we can ALSO nest all of its peers deeper
        let canNest = true
        for (const peer of peerSet) {
          if (peer === current)
            continue
          const deepestTarget = deepestNestingTarget(entryEdge.from, peer.name)
          if (deepestTarget === target) {
            consoleError(' >> cannot nest', peer.name)
            canNest = false
            break
          }
        }
        if (canNest) {
          consoleError('> can nest, continue')
          continue
        }
      }

      // If the entry edge is something in our peer group, and the one
      // in our peer group will replace it, then we replace.
      // otherwise, it's a conflict.  however, we only will treat it as
      // a valid replacement if it has not already been overridden in the
      // peer set.
      const rep = this.dep.parent.children.get(entryEdge.name)
      if (rep && rep.satisfies(entryEdge) && ![...rep.edgesIn].some(e => e.overridden)) {
        consoleError('> have replacement, continue', rep, entryEdge, this.dep.parent.children.values())
        continue
      }

      // last chance, if the peer edges from the entry node will all be
      // satisfied by the versions in this peer set, then we can replace
      if (!rep) {
        let canReplace = true
        consoleError('check for entryEdge dependencies')
        for (const edge of entryEdge.to.edgesOut.values()) {
          if (!edge.peer)
            continue
          const rep = this.dep.parent.children.get(edge.name)
          // if no replacement, not relevant
          if (!rep)
            continue
          if (rep.satisfies(edge))
            continue
          else {
            canReplace = false
            break
          }
        }
        if (canReplace) {
          consoleError('\ncanReplace because entryEdge.to is happy', entryEdge, entryEdge.to, peerSet)
          continue
        }
      }

      // ok, so the entryEdge comes from the same target, and it's outside
      // our peerSet.  this is a conflict (though we may still opt to keep
      // it, if it's forced, or not ours and not strict).
      consoleError('> found conflict', entryEdge)
      this.conflicts.set(entryEdge, peerSet)
    }

    // NB: if we're in force mode, or it's not ours and not strict, and
    // this is the only place it CAN go (ie, the first place checked),
    // then PlaceDep class will treat this as a KEEP with a warning
    consoleError('conflict or replace', this.conflicts.size)
    return this.conflicts.size ? CONFLICT : REPLACE
  }

  checkCanPlaceNoCurrent () {
    const { target, targetEdge, peerEntryEdge, dep, name } = this

    // check to see if the target doesn't have a child by that name,
    // but WANTS one, and won't be happy with this one.  if this is the
    // edge we're looking to resolve, then not relevant, of course.
    if (targetEdge && targetEdge !== peerEntryEdge) {
      if (!dep.satisfies(targetEdge))
        return CONFLICT
    }

    // check to see what that name resolves to here, and who may depend on
    // being able to reach it by crawling up past the parent.  we know
    // that it's not the target's direct child node, and if it was a direct
    // dep of the target, we would have conflicted earlier.
    const current = target !== peerEntryEdge.from && target.resolve(name)
    if (current) {
      for (const edge of current.edgesIn.values()) {
        if (edge.from.isDescendantOf(target) && edge.valid) {
          if (!dep.satisfies(edge))
            return CONFLICT
        }
      }
    }

    // no objections, so this is fine as long as peers are ok here.
    return this.canPlacePeers(OK)
  }

  get deepestNestingTarget () {
    const start = this.parent ? this.parent.deepestNestingTarget
      : this.edge.from
    return deepestNestingTarget(start, this.name)
  }

  get conflictChildren () {
    return this.allChildren.filter(c => c.canPlace === CONFLICT)
  }

  get allChildren () {
    const set = new Set(this.children)
    for (const child of set) {
      for (const grandchild of child.children)
        set.add(grandchild)
    }
    return [...set]
  }

  get top () {
    return this.parent ? this.parent.top : this
  }

  get allRelations () {
    return this.top.allChildren
  }

  canPlacePeers (state) {
    consoleError('canPlacePeers', this.name, this.dep.version, this.peerPath.map(n => [n.name, n.version]))
    this.canPlaceSelf = state
    if (!this.dep.parent || this.peerPath.includes(this.dep))
      return state

    const peerPath = [...this.peerPath, this.dep]
    for (const peerEdge of this.dep.edgesOut.values()) {
      if (!peerEdge.peer || !peerEdge.to || peerPath.includes(peerEdge.to))
        continue
      const peer = peerEdge.to
      consoleError('> check peer', peerEdge.name, peer.version)
      const cpp = new CanPlaceDep({
        dep: peer,
        target: this.target,
        parent: this,
        edge: peerEdge,
        peerPath,
      })
      this.children.push(cpp)

      if (cpp.canPlace === CONFLICT)
        return CONFLICT
    }

    return state
  }

  // what is the node that is causing this peerSet to be placed?
  get peerSetSource () {
    return this.parent ? this.parent.peerSetSource : this.edge.from
  }

  get peerEntryEdge () {
    return this.parent ? this.parent.peerEntryEdge : this.edge
  }

  static get CONFLICT () {
    return CONFLICT
  }

  static get OK () {
    return OK
  }

  static get REPLACE () {
    return REPLACE
  }

  static get KEEP () {
    return KEEP
  }

  get description () {
    const { canPlace } = this
    return canPlace && canPlace.description || canPlace
  }
}

module.exports = CanPlaceDep
