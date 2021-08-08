const semver = require('semver')

function parseVersionString(versionString, prereleaseOrder) {
  let version = semver.parse(versionString)
  if(!version) {
    return null
  }

  let rosetteJSON = {'major': version.major, 'minor': version.minor, 'bug': version.patch, 'prerelease': prereleaseOrder.prereleaseToOrder(version.prerelease) }
  return rosetteJSON
}

function rosetteConstraintFromRange(range, prereleaseOrder) {
  if(!range) {
    return {'unsolveable': null}
  }

  let dnfRosette = range.set.map(conjs => {
    return conjs.map(comp => {
      // This is a DIRTY HACK checking if the SemVer is actually the special pattern ANY
      // Note that this is a private symbol of semver, so this could break at any time.
      // See for reference: https://github.com/npm/node-semver/blob/master/classes/comparator.js
      if(comp.semver.description == 'SemVer ANY') {
        return {'any': null}
      }

      let type = null
      if(comp.operator == '>=') {
        type = '>='
      } else if(comp.operator == '<=') {
        type = '<='
      } else if(comp.operator == '>') {
        type = '>'
      } else if(comp.operator == '<') {
        type = '<'
      } else if(comp.operator == '') {
        type = '='
      } else {
        console.log('Unimplemented operator: ' + comp.operator)
        throw Error('very bad')
      }

      let version = {'major': comp.semver.major, 'minor': comp.semver.minor, 'bug': comp.semver.patch, 'prerelease': prereleaseOrder.prereleaseToOrder(comp.semver.prerelease) }
      
      return {'op': type, 'version': version}
    })
  })

  let cnfsFolded = dnfRosette.map(conjs => {
    return conjs.reduce((acc, curr) => {
      return {'&&': {'lhs': curr, 'rhs': acc}}
    })
  })

  let dnfCnfFolded = cnfsFolded.reduce((acc, curr) => {
    return {'||': {'lhs': curr, 'rhs': acc}}
  })

  return dnfCnfFolded
}

function prereleaseOrdering(xs, ys) {
  let vx = new semver.SemVer('1.0.0') // placeholder
  vx.prerelease = xs
  let vy = new semver.SemVer('1.0.0') // placeholder
  vy.prerelease = ys
  
  // This just invokes this directly:
  // https://github.com/npm/node-semver/blob/e79ac3a450e8bb504e78b8159e3efc70895699b8/classes/semver.js#L119
  // Which is kind of a hack, but seems better than copy-pasting that code here.
  return vx.comparePre(vy)
}

function buildPrereleaseOrder(prereleases) {
  let all = new Set(prereleases.map(JSON.stringify))
  all.delete(JSON.stringify([]))
  let uniques = null
  try {
    uniques = [...all].map(JSON.parse)
  } catch (err) {
    console.error(err)
  }
  uniques.sort(prereleaseOrdering)
  uniques.unshift([]) // Empty prerelease is given the distinguished index of 0

  let orderMap = {}
  for(let i = 0; i < uniques.length; i++) {
    orderMap[JSON.stringify(uniques[i])] = i
  }
  return {
    prereleaseToOrder: (prerelease) => prerelease ? orderMap[JSON.stringify(prerelease)] : orderMap[JSON.stringify([])],
    orderToPrerelease: (order) => uniques[order]
  }
}

function literalSemver(major, minor, bug, prerelease) {
  let v = new semver.SemVer("1.0.0") // tmp placeholder
  v.major = major
  v.minor = minor
  v.patch = bug
  v.prerelease = prerelease
  v.format()
  return v
}



function prereleaseOrderOrdering(p1, p2) {
  if (p1 == p2) {
    return 0
  } else if(p1 == 0) {
    return 1
  } else if(p2 == 0) {
    return -1
  } else if(p1 < p2) {
    return -1
  } else if(p1 > p2) {
    return 1
  } else {
    throw new Error('BAD!')
  }
}

function orderJsonVersion(v1, v2) {
  if(v1.major != v2.major) {
    return v1.major - v2.major
  } else if(v1.minor != v2.minor) {
    return v1.minor - v2.minor
  } else if(v1.bug != v2.bug) {
    return v1.bug - v2.bug
  } else {
    return prereleaseOrderOrdering(v1.prerelease, v2.prerelease)
  }
}

module.exports = {
  rosetteConstraintFromRange,
  parseVersionString,
  buildPrereleaseOrder,
  literalSemver,
  orderJsonVersion,
}