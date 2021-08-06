const t = require('tap')
const dsl = require('../../lib/arborist/rosette-expr-dsl.js')
const { ROSETTE_FUNCTIONS, 
  CONSTRAINT_PRIMITIVES } = require('../../lib/arborist/rosette-functions.js')
const { rosetteConstraintFromRange, 
  parseVersionString, 
  buildPrereleaseOrder } = require('../../lib/arborist/rosette-translation-helpers.js')

const semver = require('semver')



function constraintInterpretationProperty(input) {
  const { versionString, knownVersions, rangeString } = input

  const semverVersion = semver.parse(versionString)
  if(!semverVersion) {
    throw new Error(`Bad input: could not parse version string: ${versionString}`)
  }
  const knownSemverVersions = knownVersions.map(kv => {
    const svkv = semver.parse(kv)
    if(!svkv) {
      throw new Error(`Bad input: could not parse version string: ${kv}`)
    }
    return svkv
  })
  const prereleases = knownSemverVersions.map(kv => kv.prerelease)

  const range = new semver.Range(rangeString)

  const order = buildPrereleaseOrder(prereleases)
  const jsonVersion = parseVersionString(versionString, order)
  const constraint = rosetteConstraintFromRange(range, order)

  const constraintFn = dsl.evalFunction(CONSTRAINT_PRIMITIVES, ROSETTE_FUNCTIONS, "constraintInterpretation", [constraint])
  const rosetteVersion = dsl.evalFunction(CONSTRAINT_PRIMITIVES, ROSETTE_FUNCTIONS, 'versionDeserialize', [jsonVersion])

  const semverMatch = range.test(semverVersion)
  const dslMatch = constraintFn(rosetteVersion)

  return (semverMatch && dslMatch) || ((!semverMatch) && (!dslMatch))
}

function generateConstraintintInterpretationInput() {
  return {
    versionString: '1.2.3', 
    knownVersions: ['1.2.3', '1.2.4', '1.2.5'], 
    rangeString: '>=1.2.3 <1.2.6'
  }
}


function propertyTest(inputFn, propertyFn, name, num = 100) {
  t.test(name, t => {
    for (let index = 0; index < num; index++) {
      const input = inputFn()
      t.ok(propertyFn(input), name, {input})
    }
    t.end()
  })
  
}

propertyTest(generateConstraintintInterpretationInput, constraintInterpretationProperty, 'constraintInterpretation')
