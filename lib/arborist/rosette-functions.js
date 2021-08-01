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
    [new DictionaryPattern({"major": new BindingPattern("major"), "minor": new BindingPattern("minor"), "bug": new BindingPattern("bug")})],
    new PrimitiveOpExpr('immutable-vector', [new VarExpr("major"), new VarExpr("minor"), new VarExpr("bug")])
  )
])

const versionSerialize = new FunctionDef(1, [
  new FunctionRule(
    [new VectorPattern([new BindingPattern("major"), new BindingPattern("minor"), new BindingPattern("bug")])],
    new PrimitiveOpExpr('make-json-hash', [new PrimitiveOpExpr("list", [
      new PrimitiveOpExpr('cons', [new ConstExpr("major"), new VarExpr("major")]),
      new PrimitiveOpExpr('cons', [new ConstExpr("minor"), new VarExpr("minor")]),
      new PrimitiveOpExpr('cons', [new ConstExpr("bug"), new VarExpr("bug")])
    ])])
  )
])


const npmConsistency = new FunctionDef(2, [
  new FunctionRule(
    [new WildcardPattern(), new WildcardPattern()],
    new ConstExpr(true)
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