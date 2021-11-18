// Fantastic JS hack: https://stackoverflow.com/a/61958726
const importAll = () => {
  return {
    mod: null,
    from(modName) {
      this.mod = require(modName);
      Object.keys(this.mod)
            .forEach(exportedElementId => global[exportedElementId] = this.mod[exportedElementId]);
    }
  }
}

importAll().from('./rosette-expr-dsl.js')
const { dictBind, vecBind, theVar, c, op } = require('./rosette-expr-dsl.js').helpers



function order(x, y, ifLess, ifEqual, ifGreater) {
  return op('||',
    op('&&', op('<', x, y), ifLess),
    op('&&', op('==', x, y), ifEqual),
    op('&&', op('>', x, y), ifGreater))
}


/*
// Given a constraint and a version, check if the constraint is satisfied,
// assuming that prereleases should be allowed.
// Cases to handle: && and OP
matchAssumePrereleaseOk : Constraint -> Symb Version -> Boolean
*/

const matchAssumePrereleaseOk = new FunctionDef(1, [
  // matchAssumePrereleaseOk (lhs && rhs) :=
  //   let lhs_match = matchAssumePrereleaseOk lhs in
  //   let rhs_match = matchAssumePrereleaseOk rhs in
  //   λ v* → lhs_match v* && rhs_match v*
  new FunctionRule(
    [new DictionaryPattern({'&&': dictBind('lhs', 'rhs')})],
    new LetExpr('lhs_match', new CallExpr('matchAssumePrereleaseOk', [theVar('lhs')]),
      new LetExpr('rhs_match', new CallExpr('matchAssumePrereleaseOk', [theVar('rhs')]),
        new LambdaExpr('v*', 
          op('&&', 
            op('apply', theVar('lhs_match'), theVar('v*')), 
            op('apply', theVar('rhs_match'), theVar('v*')))
        )
      )
    )
  ),

  // matchAssumePrereleaseOk (OP > [major, minor, bug, prerelease]) :=
  //   λ v* → TODO
  new FunctionRule(
    [new DictionaryPattern({'op': new ConstPattern('>'), 'version': dictBind('major', 'minor', 'bug', 'prerelease')})],
    new LambdaExpr('v*',
      new LetExpr('v*.major', op('vector-ref', theVar('v*'), c(0)), 
      new LetExpr('v*.minor', op('vector-ref', theVar('v*'), c(1)), 
      new LetExpr('v*.bug', op('vector-ref', theVar('v*'), c(2)), 
      new LetExpr('v*.prerelease', op('vector-ref', theVar('v*'), c(3)), 
        order(theVar('major'), theVar('v*.major'),
          c(true),
          order(theVar('minor'), theVar('v*.minor'),
            c(true),
            order(theVar('bug'), theVar('v*.bug'),
              c(true),
              op('&&', 
                op('not', op('==', theVar('prerelease'), c(0))), 
                op('||', 
                  op('==', theVar('v*.prerelease'), c(0)), 
                  op('>', theVar('v*.prerelease'), theVar('prerelease')))),
              c(false)
            ),
            c(false)
          ),
          c(false)
        )
      ))))
    )
  ),

  // matchAssumePrereleaseOk (OP >= [major, minor, bug, prerelease]) :=
  //   λ v* → TODO
  new FunctionRule(
    [new DictionaryPattern({'op': new ConstPattern('>='), 'version': new BindingPattern('version')})],
    new LetExpr('gt_lambda',
      new CallExpr('matchAssumePrereleaseOk', [op('make-json-hash', op("list",
        op('cons', c("op"), c(">")),
        op('cons', c("version"), theVar("version"))
      ))]),

      new LetExpr('eq_lambda',
        new CallExpr('matchAssumePrereleaseOk', [op('make-json-hash', op("list",
          op('cons', c("op"), c('=')),
          op('cons', c("version"), theVar("version"))
        ))]),

        new LambdaExpr('v*',
          op('||', 
            op('apply', theVar('gt_lambda'), theVar('v*')), 
            op('apply', theVar('eq_lambda'), theVar('v*')))
        )
      )
    )
  ),

  // matchAssumePrereleaseOk (OP = [major, minor, bug, prerelease]) :=
  //   λ v* → v*.major == major && v*.minor == minor && v*.bug == bug && v*.prerelease == prerelease
  new FunctionRule(
    [new DictionaryPattern({'op': new ConstPattern('='), 'version': dictBind('major', 'minor', 'bug', 'prerelease')})],
    new LambdaExpr('v*',
      new LetExpr('v*.major', op('vector-ref', theVar('v*'), c(0)), 
      new LetExpr('v*.minor', op('vector-ref', theVar('v*'), c(1)), 
      new LetExpr('v*.bug', op('vector-ref', theVar('v*'), c(2)), 
      new LetExpr('v*.prerelease', op('vector-ref', theVar('v*'), c(3)), 
        op('&&', 
          op('==', theVar('v*.major'), theVar('major')),
          op('==', theVar('v*.minor'), theVar('minor')), 
          op('==', theVar('v*.bug'), theVar('bug')), 
          op('==', theVar('v*.prerelease'), theVar('prerelease')))
      ))))
    )
  ),

  // matchAssumePrereleaseOk (OP <= [major, minor, bug, prerelease]) :=
  //   λ v* → TODO
  new FunctionRule(
    [new DictionaryPattern({'op': new ConstPattern('<='), 'version': new BindingPattern('version')})],
    new LetExpr('gt_lambda',
      new CallExpr('matchAssumePrereleaseOk', [op('make-json-hash', op("list",
        op('cons', c("op"), c(">")),
        op('cons', c("version"), theVar("version"))
      ))]),

      new LambdaExpr('v*',
        op('not', op('apply', theVar('gt_lambda'), theVar('v*'))), 
      )
    )
  ),

  // matchAssumePrereleaseOk (OP < [major, minor, bug, prerelease]) :=
  //   λ v* → TODO
  new FunctionRule(
    [new DictionaryPattern({'op': new ConstPattern('<'), 'version': new BindingPattern('version')})],
    new LetExpr('gte_lambda',
      new CallExpr('matchAssumePrereleaseOk', [op('make-json-hash', op("list",
        op('cons', c("op"), c(">=")),
        op('cons', c("version"), theVar("version"))
      ))]),

      new LambdaExpr('v*',
        op('not', op('apply', theVar('gte_lambda'), theVar('v*'))), 
      )
    )
  )
])

/*
// Given a constraint and a version, check if a (sub) constraint comparator contains
// an identical version (excluding prerelease) that has a prerelease
// Cases to handle: && and OP
checkPrereleaseOk : Constraint -> Symb Version -> Boolean
*/

const checkPrereleaseOk = new FunctionDef(1, [
  // checkPrereleaseOk (OP op [major, minor, bug, 0]) := λ v* → false
  new FunctionRule(
    [new DictionaryPattern({
      'op': new WildcardPattern(), 
      'version': new DictionaryPattern({
        'major': new WildcardPattern(),
        'minor': new WildcardPattern(),
        'bug': new WildcardPattern(),
        'prerelease': new ConstPattern(0)})})],
    new LambdaExpr('v*', c(false))
  ),

  // checkPrereleaseOk (OP op [major, minor, bug, *]) := 
  //   λ v* → v*.major = major && v*.minor = minor && v*.bug = bug
  new FunctionRule(
    [new DictionaryPattern({
      'op': new WildcardPattern(), 
      'version': new DictionaryPattern({
        'major': new BindingPattern('major'),
        'minor': new BindingPattern('minor'),
        'bug': new BindingPattern('bug'),
        'prerelease': new WildcardPattern()})})],
    new LambdaExpr('v*', 
      new LetExpr('v*.major', op('vector-ref', theVar('v*'), c(0)), 
      new LetExpr('v*.minor', op('vector-ref', theVar('v*'), c(1)), 
      new LetExpr('v*.bug', op('vector-ref', theVar('v*'), c(2)),
      op('&&', 
        op('==', theVar('major'), theVar('v*.major')),
        op('==', theVar('minor'), theVar('v*.minor')),
        op('==', theVar('bug'), theVar('v*.bug')))
    ))))
  ),

  // checkPrereleaseOk (c1 && c2) :=
  //   let c1_pre = checkPrereleaseOk c1 in
  //   let c2_pre = checkPrereleaseOk c2 in
  //   λ v* → (c1_pre v*) || (c2_pre v*)
  new FunctionRule(
    [new DictionaryPattern({'&&': dictBind('lhs', 'rhs')})],
    new LetExpr('lhs_pre', new CallExpr('checkPrereleaseOk', [theVar('lhs')]),
    new LetExpr('rhs_pre', new CallExpr('checkPrereleaseOk', [theVar('rhs')]),
      new LambdaExpr('v*', 
        op('||', 
          op('apply', theVar('lhs_pre'), theVar('v*')), 
          op('apply', theVar('rhs_pre'), theVar('v*')))
      )
    ))
  )
])


/*
⟦_⟧ : Constraint -> Symb Version -> Boolean
*/

const constraintInterpretation = new FunctionDef(1, [
  // ⟦ unsolveable ⟧ := λ v* → false
  new FunctionRule(
    [new DictionaryPattern({'unsolveable': new WildcardPattern()})],
    new LambdaExpr('v*', c(false))
  ),


  // ⟦ any ⟧ := λ v* → true
  new FunctionRule(
    [new DictionaryPattern({'any': new WildcardPattern()})],
    new LambdaExpr('v*', 
      new LetExpr('v*.prerelease', op('vector-ref', theVar('v*'), c(3)), 
        op('==', theVar('v*.prerelease'), c(0))
      )
    )
  ),

  
  // ⟦ c1 && c2 ⟧ := 
  //   let c1_match = matchAssumePrereleaseOk c1 in
  //   let c2_match = matchAssumePrereleaseOk c2 in
  //   let c1_pre = checkPrereleaseOk c1 in
  //   let c2_pre = checkPrereleaseOk c2 in
  //   λ v* → (c1_match v* && c2_match v*) && (v*.prerelease == 0 || c1_pre v* || c2_pre v*)
  new FunctionRule(
    [new DictionaryPattern({'&&': dictBind('lhs', 'rhs')})],
    new LetExpr('lhs_pre', new CallExpr('checkPrereleaseOk', [theVar('lhs')]),
    new LetExpr('rhs_pre', new CallExpr('checkPrereleaseOk', [theVar('rhs')]),
    new LetExpr('lhs_match', new CallExpr('matchAssumePrereleaseOk', [theVar('lhs')]),
    new LetExpr('rhs_match', new CallExpr('matchAssumePrereleaseOk', [theVar('rhs')]),
      new LambdaExpr('v*', 
        op('&&', 
          op('apply', theVar('lhs_match'), theVar('v*')),
          op('apply', theVar('rhs_match'), theVar('v*')), 
          op('||', 
            op('==', op('vector-ref', theVar('v*'), c(3)), c(0)), 
            op('apply', theVar('lhs_pre'), theVar('v*')),
            op('apply', theVar('rhs_pre'), theVar('v*'))))
      )
    ))))
  ),


  // ⟦ c1 || c2 ⟧ := 
  //   let c1_match = ⟦ c1 ⟧ in
  //   let c2_match = ⟦ c2 ⟧ in
  //   λ v* → (c1_match v*) || (c2_match v*)
  new FunctionRule(
    [new DictionaryPattern({'||': dictBind('lhs', 'rhs')})],
    new LetExpr('lhs_match', new CallExpr('constraintInterpretation', [theVar('lhs')]),
    new LetExpr('rhs_match', new CallExpr('constraintInterpretation', [theVar('rhs')]),
      new LambdaExpr('v*', 
        op('||', 
          op('apply', theVar('lhs_match'), theVar('v*')), 
          op('apply', theVar('rhs_match'), theVar('v*')))
      )
    ))
  ),


  // ⟦ c @ OP op v ⟧ := 
  //   let c_match = matchAssumePrereleaseOk c in
  //   let c_pre = checkPrereleaseOk c in
  //   λ v* → (c_match v*) && (v*.prerelease == 0 || c_pre v*)
  new FunctionRule(
    [new BindingPattern('c')],
    new LetExpr('c_match', new CallExpr('matchAssumePrereleaseOk', [theVar('c')]),
    new LetExpr('c_pre', new CallExpr('checkPrereleaseOk', [theVar('c')]),
      new LambdaExpr('v*',
        op('&&',
          op('apply', theVar('c_match'), theVar('v*')),
          op('||', 
            op('==', op('vector-ref', theVar('v*'), c(3)), c(0)), 
            op('apply', theVar('c_pre'), theVar('v*'))))
      )
    ))
  )
])



const versionDeserialize = new FunctionDef(1, [
  new FunctionRule(
    [dictBind("major", "minor", "bug", "prerelease")],
    op('immutable-vector', theVar("major"), theVar("minor"), theVar("bug"), theVar("prerelease"))
  )
])

const versionSerialize = new FunctionDef(1, [
  new FunctionRule(
    [vecBind("major", "minor", "bug", "prerelease")],
    op('make-json-hash', op("list",
      op('cons', c("major"), theVar("major")),
      op('cons', c("minor"), theVar("minor")),
      op('cons', c("bug"), theVar("bug")),
      op('cons', c("prerelease"), theVar("prerelease"))
    ))
  )
])

// npmConsistency: Vec Int 4 -> Vec Int 4 -> Boolean
const npmConsistency = new FunctionDef(2, [
  new FunctionRule(
    [new WildcardPattern(), new WildcardPattern()],
    c(true)
  )
])

// pipConsistency: Vec Int 4 -> Vec Int 4 -> Boolean
const pipConsistency = new FunctionDef(2, [
  new FunctionRule(
    [
      vecBind('v1.major', 'v1.minor', 'v1.bug', 'v1.pre'), 
      vecBind('v2.major', 'v2.minor', 'v2.bug', 'v2.pre')
    ],
    op('&&',
      op('==', theVar('v1.major'), theVar('v2.major')),
      op('==', theVar('v1.minor'), theVar('v2.minor')),
      op('==', theVar('v1.bug'), theVar('v2.bug')),
      op('==', theVar('v1.pre'), theVar('v2.pre')))
  )
])

// pipConsistency: Vec Int 4 -> Vec Int 4 -> Boolean
const cargoConsistency = new FunctionDef(2, [
  new FunctionRule(
    [
      vecBind('v1.major', 'v1.minor', 'v1.bug', 'v1.pre'), 
      vecBind('v2.major', 'v2.minor', 'v2.bug', 'v2.pre')
    ],

    new LetExpr('compat', 
      op('ite', 
        op('&&', 
          op('==', theVar('v1.major'), c(0)), 
          op('==', theVar('v2.major'), c(0))), 
        op('ite', 
          op('&&', 
            op('==', theVar('v1.minor'), c(0)), 
            op('==', theVar('v2.minor'), c(0))), 
          op('ite', 
            op('&&', 
              op('==', theVar('v1.bug'), c(0)), 
              op('==', theVar('v2.bug'), c(0))), 
            op('==', theVar('v1.pre'), theVar('v2.pre')),
            op('==', theVar('v1.bug'), theVar('v2.bug'))),
          op('==', theVar('v1.minor'), theVar('v2.minor'))),
        op('==', theVar('v1.major'), theVar('v2.major')))
      ,
      op('not', theVar('compat'))
    )
  )
])


// p_cost : Syntax package-group -> Syntax Number
// v_cost : Syntax vertex-node -> Syntax Number
function sumCosts(p_cost, v_cost) {
  // Graph -> Number
  let fn_rule = new FunctionRule(
    [new BindingPattern('g')],
    new LetExpr('p_group_fn', 
      new LambdaExpr('v_node', 
        new LambdaExpr('v_active*',
          new LambdaExpr('v_acc', 
            op('+', 
              theVar('v_acc'), 
              op('ite', theVar('v_active*'), v_cost(theVar('v_node')), c(0)))))),
      new LetExpr('ps_fn', 
        new LambdaExpr('p_group', 
          new LambdaExpr('p_group_cost', 
            new LambdaExpr('p_acc', 
              op('+',
                theVar('p_acc'),
                theVar('p_group_cost'),
                p_cost(theVar('p_group')))))),
        op(
          'foldl/graph', 
          theVar('g'), 
          c(0), 
          theVar('p_group_fn'),
          c(0),
          theVar('ps_fn')
        )
      )
    )
  )

  return new FunctionDef(1, [fn_rule])

  // foldl/graph: 
  //  Graph 
  //  -> AccV 
  //  -> (version-node -> Symb Boolean -> AccV -> AccV) 
  //  -> AccP 
  //  -> (package-group -> AccV -> AccP -> AccP) 
  //  -> AccP
  // ite: Boolean -> A -> A -> A
  // +: Number* -> Number

  // get-cost-val/version-node: version-node -> String -> Number
  // get-cost-val/package-group: package-group -> String -> Number
}





function min_duplicates_make() {
  // Graph -> Number
  let fn_rule = new FunctionRule(
    [new BindingPattern('g')],
    new LetExpr('p_group_fn', 
      new LambdaExpr('v_node', 
        new LambdaExpr('v_active*',
          new LambdaExpr('v_acc', 
            op('+', 
              theVar('v_acc'), 
              op('ite', theVar('v_active*'), c(1), c(0)))))),
      new LetExpr('ps_fn', 
        new LambdaExpr('p_group', 
          new LambdaExpr('p_group_cost', 
            new LambdaExpr('p_acc', 
              op('+',
                theVar('p_acc'),
                op('ite', 
                  op('>', theVar('p_group_cost'), c(0)),
                  op('-', theVar('p_group_cost'), c(1)),
                  theVar('p_group_cost')))))),
        op(
          'foldl/graph', 
          theVar('g'), 
          c(0), 
          theVar('p_group_fn'),
          c(0),
          theVar('ps_fn')
        )
      )
    )
  )

  return new FunctionDef(1, [fn_rule])
}

const min_duplicates = min_duplicates_make()





// terms: [{base: 'min_num_deps', coeff: 1.0}]
function linearCombination(terms) {

  const terms_stx = terms.map((term) => op('*', c(term.coeff), new CallExpr(term.base, [theVar('g')])))
  const sum_stx = op('+', ...terms_stx)

  let fn_rule = new FunctionRule(
    [new BindingPattern('g')],
    sum_stx
  )

  return new FunctionDef(1, [fn_rule])
}


const CONSTRAINT_PRIMITIVES = {
  ["make-json-hash"]: function(pairs) {
    return Object.fromEntries(pairs)
  },
  list: function(...xs) {
    return xs
  },
  cons: function(x, y) {
    return [x, y]
  },
  ["immutable-vector"]: function(...xs) { // Don't need for constraintInterpretation
    return xs
  },
  ["&&"]: function(...xs) {
    return xs.every(x => x)
  },
  ["||"]: function(...xs) {
    return xs.some(x => x)
  },
  apply: function(fn, arg) {
    return fn(arg)
  },
  not: function(x) {
    return !x
  },
  ["vector-ref"]: function(vector, index) {
    return vector[index]
  },
  ["<"]: function(x, y) {
    return x < y
  },
  ["=="]: function(x, y) {
    return x == y
  },
  [">"]: function(x, y) {
    return x > y
  },
}

const ROSETTE_FUNCTIONS = {
  "matchAssumePrereleaseOk": matchAssumePrereleaseOk,
  "checkPrereleaseOk": checkPrereleaseOk,
  "constraintInterpretation": constraintInterpretation,
  "versionDeserialize": versionDeserialize,
  "versionSerialize": versionSerialize,
}



module.exports = {
  ROSETTE_FUNCTIONS,
  CONSTRAINT_PRIMITIVES,
  sumCosts,
  linearCombination,
  min_duplicates,
  CONSISTENCY_RELATIONS: {
    npm: npmConsistency,
    pip: pipConsistency,
    cargo: cargoConsistency
  }
}