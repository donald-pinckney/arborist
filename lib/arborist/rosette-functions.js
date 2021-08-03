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


/*



// Given a constraint and a version, check if the constraint is satisfied,
// assuming that prereleases should be allowed.
// Cases to handle: && and OP
matchAssumePrereleaseOk : Constraint -> Symb Version -> Boolean
matchAssumePrereleaseOk (c1 && c2) :=
  let c1_match = matchAssumePrereleaseOk c1 in
  let c2_match = matchAssumePrereleaseOk c2 in
  λ v* → c1_match v* && c2_match v*
matchAssumePrereleaseOk (OP > [major, minor, bug, prerelease]) :=
  λ v* → TODO
matchAssumePrereleaseOk (OP >= [major, minor, bug, prerelease]) :=
  λ v* → TODO
matchAssumePrereleaseOk (OP = [major, minor, bug, prerelease]) :=
  λ v* → v*.major == major && v*.minor == minor && v*.bug == bug && v*.prerelease == prerelease
matchAssumePrereleaseOk (OP <= [major, minor, bug, prerelease]) :=
  λ v* → TODO
matchAssumePrereleaseOk (OP < [major, minor, bug, prerelease]) :=
  λ v* → TODO


// Given a constraint and a version, check if a (sub) constraint comparator contains
// an identical version (excluding prerelease) that has a prerelease
// Cases to handle: && and OP
checkPrereleaseOk : Constraint -> Symb Version -> Boolean
checkPrereleaseOk (OP op [major, minor, bug, 0]) := λ v* → false
checkPrereleaseOk (OP op [major, minor, bug, *]) := 
  λ v* → v*.major = major && v*.minor = minor && v*.bug = bug
checkPrereleaseOk (c1 && c2) :=
  let c1_pre = checkPrereleaseOk c1 in
  let c2_pre = checkPrereleaseOk c2 in
  λ v* → (c1_pre v*) && (c2_pre v*)

⟦_⟧ : Constraint -> Symb Version -> Boolean

⟦ unsolveable ⟧ := λ v* → false
⟦ c1 && c2 ⟧ := 
  let c1_match = matchAssumePrereleaseOk c1 in
  let c2_match = matchAssumePrereleaseOk c2 in
  let c1_pre = checkPrereleaseOk c1 in
  let c2_pre = checkPrereleaseOk c2 in
  λ v* → (c1_match v* && c2_match v*) && (v*.prerelease == 0 || c1_pre v* || c2_pre v*)
⟦ c1 || c2 ⟧ := 
  let c1_match = ⟦ c1 ⟧ in
  let c2_match = ⟦ c2 ⟧ in
  λ v* → (c1_match v*) || (c2_match v*)
⟦ c @ OP op v ⟧ := 
  let c_match = matchAssumePrereleaseOk c in
  let c_pre = checkPrereleaseOk c in
  λ v* → (c_match v*) && (v*.prerelease == 0 || c_pre v*)


*/



const constraintPrereleaseMatch

const constraintInterpretation = new FunctionDef(1, [
  // ⟦ wildcardMajor ⟧ v' := true
  new FunctionRule(
    [new DictionaryPattern({"wildcardMajor": new WildcardPattern()})],
    new LambdaExpr("v'", new ConstExpr(true))
  ),
  // ⟦ exactly v ⟧ v' := v = v'
  new FunctionRule(
    [new DictionaryPattern({"exactly": new BindingPattern("cv")})],
    new LetExpr("cvv", new CallExpr("versionDeserialize", [new VarExpr("cv")]),
      new LambdaExpr("v'", new PrimitiveOpExpr("equal?", [new VarExpr("v'"), new VarExpr("cvv")])))
  ),
  // ⟦ unsolveable ⟧ v' := false
  new FunctionRule(
    [new DictionaryPattern({"unsolveable": new WildcardPattern()})],
    new LambdaExpr("v'", new ConstExpr(false))
  ),
  // ⟦ caret 0 y z ⟧ v' := v'.x = 0 && v'.y = y && v'.z >= z
  new FunctionRule(
    [new DictionaryPattern({"caret": new DictionaryPattern({
      "major": new ConstPattern(0), 
      "minor": new BindingPattern("minor"), 
      "bug": new BindingPattern("bug")})})],
    new LambdaExpr("v'", 
      new PrimitiveOpExpr("&&", [
        new PrimitiveOpExpr("=", [new PrimitiveOpExpr("vector-ref", [new VarExpr("v'"), new ConstExpr(0)]), new ConstExpr(0)]),
        new PrimitiveOpExpr("=", [new PrimitiveOpExpr("vector-ref", [new VarExpr("v'"), new ConstExpr(1)]), new VarExpr("minor")]),
        new PrimitiveOpExpr(">=", [new PrimitiveOpExpr("vector-ref", [new VarExpr("v'"), new ConstExpr(2)]), new VarExpr("bug")])]))
  ),
  // ⟦ caret x y z ⟧ v' := v'.x = x && ((v'.y = y && v'.z >= z) || v'.y > y)
  new FunctionRule(
    [new DictionaryPattern({"caret": new DictionaryPattern({
      "major": new BindingPattern("major"), 
      "minor": new BindingPattern("minor"), 
      "bug": new BindingPattern("bug")})})],
    new LambdaExpr("v'", 
      new PrimitiveOpExpr("&&", [
        new PrimitiveOpExpr("=", [new PrimitiveOpExpr("vector-ref", [new VarExpr("v'"), new ConstExpr(0)]), new VarExpr("major")]),
        new PrimitiveOpExpr("||", [
          new PrimitiveOpExpr("&&", [
            new PrimitiveOpExpr("=", [new PrimitiveOpExpr("vector-ref", [new VarExpr("v'"), new ConstExpr(1)]), new VarExpr("minor")]),
            new PrimitiveOpExpr(">=", [new PrimitiveOpExpr("vector-ref", [new VarExpr("v'"), new ConstExpr(2)]), new VarExpr("bug")])]),
          new PrimitiveOpExpr(">", [new PrimitiveOpExpr("vector-ref", [new VarExpr("v'"), new ConstExpr(1)]), new VarExpr("minor")])])]))
  ),
  // ⟦ tilde x y z ⟧ v' := v'.x = x && v'.y = y && v'.z >= z
  new FunctionRule(
    [new DictionaryPattern({"tilde": new DictionaryPattern({
      "major": new BindingPattern("major"), 
      "minor": new BindingPattern("minor"), 
      "bug": new BindingPattern("bug")})})],
    new LambdaExpr("v'", 
      new PrimitiveOpExpr("&&", [
        new PrimitiveOpExpr("=", [new PrimitiveOpExpr("vector-ref", [new VarExpr("v'"), new ConstExpr(0)]), new VarExpr("major")]),
        new PrimitiveOpExpr("=", [new PrimitiveOpExpr("vector-ref", [new VarExpr("v'"), new ConstExpr(1)]), new VarExpr("minor")]),
        new PrimitiveOpExpr(">=", [new PrimitiveOpExpr("vector-ref", [new VarExpr("v'"), new ConstExpr(2)]), new VarExpr("bug")])]))
  ),
])

const versionDeserialize = new FunctionDef(1, [
  new FunctionRule(
    [dictBind("major", "minor", "bug", "prerelease")],
    op('immutable-vector', theVar("major"), theVar("minor"), theVar("bug"))
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


const npmConsistency = new FunctionDef(2, [
  new FunctionRule(
    [new WildcardPattern(), new WildcardPattern()],
    c(true)
  )
])

// (define DSL-PRIMITIVES-SYMBOLIC (make-immutable-hash (list
//   (cons "equal?" equal?)
//   (cons "immutable-vector" vector-immutable)
//   (cons "&&" &&)
//   (cons "||" ||)
//   (cons "=" =)
//   (cons ">=" >=)
//   (cons ">" >)
//   (cons "vector-ref" vector-ref)
// )))

const CONSTRAINT_PRIMITIVES = {
  // ... copy from above for JS
}

const ROSETTE_FUNCTIONS = {
  "constraintInterpretation": constraintInterpretation,
  "consistency": npmConsistency,
  "versionDeserialize": versionDeserialize,
  "versionSerialize": versionSerialize,
}

module.exports = {
  ROSETTE_FUNCTIONS,
  CONSTRAINT_PRIMITIVES
}