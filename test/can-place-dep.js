const t = require('tap')
const CanPlaceDep = require('../lib/can-place-dep.js')
const {
  CONFLICT,
  OK,
  REPLACE,
  KEEP,
} = CanPlaceDep

const Node = require('../lib/node.js')



t.test('basic placement check tests', t => {
  const path = '/some/path'

  // boilerplate so we can define a bunch of test cases declaratively
  const runTest = (desc, {
    tree,
    targetLoc,
    nodeLoc,
    dep,
    expect,
    preferDedupe,
    peerSet,
    explicitRequest,
  }) => {
    const target = tree.inventory.get(targetLoc)
    const node = tree.inventory.get(nodeLoc)
    const edge = node.edgesOut.get(dep.name)
    const vr = new Node({
      sourceReference: node,
      path: node.path,
      pkg: { ...node.package },
      children: peerSet,
    })
    dep.parent = vr

    const msg = `place ${
      dep.package._id
    } in ${targetLoc || 'ROOT'} for { ${
      edge.from.location || 'ROOT'
    } ${
      edge.type + ' ' + edge.name + '@' + edge.spec
    } }`

    t.test(desc, t => {
      const cpd = new CanPlaceDep({
        target,
        edge,
        dep,
        preferDedupe,
        explicitRequest,
      })
      // dump a comment if the assertion fails.
      // would put it in the diags, but yaml stringifies Set objects
      // super awkwardly, and Node objects have a lot of those.
      if (!t.equal(cpd.canPlace, expect, msg))
        t.comment(cpd)
      t.equal(cpd.description, cpd.canPlace.description || cpd.canPlace)
      t.end()
    })
  }

  runTest('basic placement of a dep, no conflicts or issues', {
    tree: new Node({
      path,
      pkg: { name: 'project', version: '1.2.3', dependencies: { a: '1.x' }},
    }),
    targetLoc: '',
    nodeLoc: '',
    dep: new Node({
      pkg: { name: 'a', version: '1.2.3' },
    }),
    expect: OK,
  })

  runTest('replace an existing dep', {
    tree: new Node({
      path,
      pkg: { name: 'project', version: '1.2.3', dependencies: { a: '1.x' }},
      children: [{pkg:{name: 'a', version: '1.0.0'}}],
    }),
    targetLoc: '',
    nodeLoc: '',
    dep: new Node({ pkg: { name: 'a', version: '1.2.3' }}),
    expect: REPLACE,
  })

  runTest('place nested', {
    tree: new Node({
      path,
      pkg: { name: 'project', version: '1.2.3', dependencies: { a: '1.x' }},
      children: [
        {pkg:{name: 'a', version: '1.0.0'}},
        {
          pkg: { name: 'b', version: '1.0.0', dependencies: { a: '2.x' }},
        },
      ],
    }),
    targetLoc: 'node_modules/b',
    nodeLoc: 'node_modules/b',
    dep: new Node({ pkg: { name: 'a', version: '2.3.4' }}),
    expect: OK,
  })

  runTest('conflict in root for nested dep', {
    tree: new Node({
      path,
      pkg: { name: 'project', version: '1.2.3', dependencies: { a: '1.x' }},
      children: [
        {pkg:{name: 'a', version: '1.0.0'}},
        {
          pkg: { name: 'b', version: '1.0.0', dependencies: { a: '2.x' }},
        },
      ],
    }),
    targetLoc: '',
    nodeLoc: 'node_modules/b',
    dep: new Node({ pkg: { name: 'a', version: '2.3.4' }}),
    expect: CONFLICT,
  })

  runTest('keep an existing dep that matches', {
    tree: new Node({
      path,
      pkg: { name: 'project', version: '1.2.3', dependencies: { a: '1' }},
      children: [
        {pkg: {name: 'a', version: '1.2.3'}},
      ],
    }),
    targetLoc: '',
    nodeLoc: '',
    dep: new Node({pkg: { name: 'a', version: '1.2.3' }}),
    expect: KEEP,
  })

  // https://github.com/npm/cli/issues/3411
  runTest('replace an existing dep that matches, explicit request', {
    tree: new Node({
      path,
      pkg: { name: 'project', version: '1.2.3', dependencies: { a: '1' }},
      children: [
        {pkg: {name: 'a', version: '1.2.3'}},
      ],
    }),
    targetLoc: '',
    nodeLoc: '',
    dep: new Node({pkg: { name: 'a', version: '1.2.3' }}),
    expect: REPLACE,
    explicitRequest: true,
  })
  runTest('replace an existing dep that could dedupe, explicit request', {
    tree: new Node({
      path,
      pkg: { name: 'project', version: '1.2.3', dependencies: {
        a: '*',
        b: '1.2.3',
      }},
      children: [
        {pkg: {name: 'a', version: '1.2.3'}},
        {pkg: {name: 'b', version: '1.2.3', dependencies: {a: '1.2.3'}}},
      ],
    }),
    targetLoc: '',
    nodeLoc: '',
    dep: new Node({pkg: { name: 'a', version: '2.3.4' }}),
    expect: REPLACE,
    explicitRequest: true,
  })
  runTest('keep an existing dep that could dedupe, explicit request, preferDedupe', {
    tree: new Node({
      path,
      pkg: { name: 'project', version: '1.2.3', dependencies: {
        a: '*',
        b: '1.2.3',
      }},
      children: [
        {pkg: {name: 'a', version: '1.2.3'}},
        {pkg: {name: 'b', version: '1.2.3', dependencies: {a: '1.2.3'}}},
      ],
    }),
    targetLoc: '',
    nodeLoc: '',
    dep: new Node({pkg: { name: 'a', version: '2.3.4' }}),
    expect: KEEP,
    preferDedupe: true,
    explicitRequest: true,
  })

  runTest('keep an existing dep that is older, but also works', {
    tree: new Node({
      path,
      pkg: { name: 'project', version: '1.2.3', dependencies: { a: '1', c: '2.0.0' }},
      children: [
        {pkg: {name: 'b', version: '2.0.0'}},
        {pkg: {name: 'c', version: '2.0.0', dependencies: { b: '2.0.0' }}},
        {pkg: {name: 'a', version: '1.2.3', dependencies: { b: '2' }}},
      ],
    }),
    targetLoc: '',
    nodeLoc: 'node_modules/a',
    dep: new Node({pkg: { name: 'b', version: '2.3.4' }}),
    expect: KEEP,
  })

  runTest('replace an existing dep that is newer, because preferDedupe', {
    tree: new Node({
      path,
      pkg: { name: 'project', version: '1.2.3', dependencies: { a: '1', c: '2.0.0' }},
      children: [
        {pkg: {name: 'b', version: '2.3.4'}},
        {pkg: {name: 'c', version: '2.0.0', dependencies: { b: '2.0.0' }}},
        {pkg: {name: 'a', version: '1.2.3', dependencies: { b: '2' }}},
      ],
    }),
    targetLoc: '',
    nodeLoc: 'node_modules/c',
    dep: new Node({pkg: { name: 'b', version: '2.0.0' }}),
    expect: REPLACE,
    preferDedupe: true,
  })

  runTest('conflict an existing dep that is newer, because no preferDedupe', {
    tree: new Node({
      path,
      pkg: { name: 'project', version: '1.2.3', dependencies: { a: '1', c: '2.0.0' }},
      children: [
        {pkg: {name: 'b', version: '2.3.4'}},
        {pkg: {name: 'c', version: '2.0.0', dependencies: { b: '2.0.0' }}},
        {pkg: {name: 'a', version: '1.2.3', dependencies: { b: '2' }}},
      ],
    }),
    targetLoc: '',
    nodeLoc: 'node_modules/c',
    dep: new Node({pkg: { name: 'b', version: '2.0.0' }}),
    expect: CONFLICT,
    preferDedupe: false,
  })

  // always OK or REPLACE if the dep being placed had errors
  runTest('return REPLACE because node had errors', {
    tree: new Node({
      path,
      pkg: { name: 'project', version: '1.2.3', dependencies: { a: '1' }},
      children: [
        {pkg: {name: 'a', version: '1.2.3'}},
      ],
    }),
    targetLoc: '',
    nodeLoc: '',
    dep: new Node({
      pkg: { name: 'a', version: '1.2.3' },
      error: new Error('uh oh'),
    }),
    expect: REPLACE,
  })
  runTest('return OK because node had errors', {
    tree: new Node({
      path,
      pkg: { name: 'project', version: '1.2.3', dependencies: { a: '1.x' }},
      children: [
        {
          pkg: { name: 'b', version: '1.0.0', peerDependencies: { a: '2.x' }},
        },
      ],
    }),
    targetLoc: '',
    nodeLoc: 'node_modules/b',
    dep: new Node({
      pkg: { name: 'a', version: '2.3.4' },
      error: new Error('uh oh'),
    }),
    expect: OK,
  })

  runTest('cannot place peer inside of dependent', {
    tree: new Node({
      path,
      pkg: { name: 'project', version: '1.2.3', dependencies: { b: '1.x' }},
      children: [
        {
          pkg: { name: 'b', version: '1.0.0', peerDependencies: { a: '2.x' }},
        },
      ],
    }),
    targetLoc: 'node_modules/b',
    nodeLoc: 'node_modules/b',
    dep: new Node({ pkg: { name: 'a', version: '2.3.4' }}),
    expect: CONFLICT,
  })

  t.end()
})

t.test('constructor debug throws', t => {
  t.throws(() => new CanPlaceDep({}), {
    message: 'no dep provided to CanPlaceDep',
  })

  t.throws(() => new CanPlaceDep({
    dep: new Node({pkg:{name:'x',version:'1.2.3'}}),
  }), {
    message: 'no target provided to CanPlaceDep',
  })

  t.throws(() => new CanPlaceDep({
    dep: new Node({pkg:{name:'x',version:'1.2.3'}}),
    target: new Node({ path: '/some/path' })
  }), {
    message: 'no edge provided to CanPlaceDep',
  })

  t.end()
})
