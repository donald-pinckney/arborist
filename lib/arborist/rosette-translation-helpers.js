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

function buildPrereleaseOrder(prereleases) {
  let all = new Set(prereleases.map(JSON.stringify))
  all.delete(JSON.stringify([]))
  let uniques = null
  try {
    uniques = [...all].map(JSON.parse)
  } catch (err) {
    console.error(err)
  }
  uniques.sort()
  uniques.unshift([])

  let orderMap = {}
  for(let i = 0; i < uniques.length; i++) {
    orderMap[JSON.stringify(uniques[i])] = i
  }
  return {
    prereleaseToOrder: (prerelease) => prerelease ? orderMap[JSON.stringify(prerelease)] : orderMap[JSON.stringify([])],
    orderToPrerelease: (order) => uniques[order]
  }
}

module.exports = {
  rosetteConstraintFromRange,
  parseVersionString,
  buildPrereleaseOrder
}