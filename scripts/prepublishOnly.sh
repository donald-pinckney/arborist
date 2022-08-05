#!/bin/bash

# build z3 and put it into the bin folder, if z3 has not been built yet
if [ ! -f "bin/z3" ]; then
  echo "Building z3..."
  pushd ../pacsolve/z3
  python3 scripts/mk_make.py --staticbin
  cd build/
  make -j$(nproc)
  popd
  mv ../pacsolve/z3/build/z3 bin/
fi

# build the rosette-solver and put it into the bin folder, if it has not been built yet
if [ ! -f "bin/solver" ]; then
    echo "Building rosette-solver..."
    pushd ../pacsolve/RosetteSolver
    raco exe rosette-solver.rkt
    raco distribute solver rosette-solver
    popd
    mv ../pacsolve/RosetteSolver/solver bin/
fi
