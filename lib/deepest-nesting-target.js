// given a starting node, what is the *deepest* target where name could go?
const deepestNestingTarget = (start, name) => {
  for (const target of start.ancestry()) {
    // note: this will skip past the first target if edge is peer
    if (target.isProjectRoot || !target.resolveParent)
      return target
    const targetEdge = target.edgesOut.get(name)
    if (!targetEdge || !targetEdge.peer)
      return target
  }
}

module.exports = deepestNestingTarget
