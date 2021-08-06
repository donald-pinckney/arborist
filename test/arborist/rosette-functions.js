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

function generateInt(max) {
  return Math.floor(Math.random() * max);
}

function randomBool(p) {
  return Math.random() < p;
}

function randomChoice(...xs) {
  return xs[generateInt(xs.length)]
}

function generateRandomVersion() {
  const major = generateInt(6)
  const minor = generateInt(6)
  const patch = generateInt(6)
  const prerelease = ['alpha', 'beta', 'rc'].filter(() => randomBool(0.15)).flatMap(tag => {
    if(randomBool(0.5)) {
      return [tag, generateInt(3)]
    } else {
      return [tag]
    }
  }).join('.')

  return `${major}.${minor}.${patch}${prerelease ? `-${prerelease}` : ''}`
}

function generateComparator() {
  const version = generateRandomVersion()
  const op = randomChoice(">", "<", ">=", "<=", "=")
  return new semver.Comparator(`${op}${version}`)
}

function generateRange() {
  const numDisj = generateInt(4)
  // const set = Array.from(Array(numDisj), () => 1)
  const set = Array.from(Array(numDisj), () => generateInt(4))
    .map(numConj => Array.from(Array(numConj), () => generateComparator()))
  let r = new semver.Range('1.2.3') // tmp
  r.set = set
  r.format()
  return r
}

function generateConstraintintInterpretationInput() {
  const version = generateRandomVersion()
  const numOthers = generateInt(10)
  let known = Array.from(Array(numOthers), () => generateRandomVersion())
  known.push(version)

  const range = generateRange()

  const rangeVersions = range.set.flatMap(conj => {
    return conj.map(comp => {
      return comp.semver.format()
    })
  })

  known = known.concat(rangeVersions)

  return {
    versionString: version, 
    knownVersions: known, 
    rangeString: range.format()
  }
}


function propertyTest(inputFn, propertyFn, name, num = 10000) {
  t.test(name, t => {
    for (let index = 0; index < num; index++) {
      const input = inputFn()
      t.ok(propertyFn(input), name, {input})
    }
    t.end()
  })
  
}

// console.log(generateConstraintintInterpretationInput())
// console.log(generateConstraintintInterpretationInput())
// console.log(generateConstraintintInterpretationInput())
// console.log(generateConstraintintInterpretationInput())
// console.log(generateConstraintintInterpretationInput())
// console.log(generateConstraintintInterpretationInput())
// console.log(generateConstraintintInterpretationInput())


propertyTest(
  generateConstraintintInterpretationInput, 
  constraintInterpretationProperty, 
  'constraintInterpretation')
