#!/bin/bash

rm -fr ./out/*

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
if [ ! -d "bin/solver" ]; then
    echo "Building rosette-solver..."
    CURPATH=$(pwd)
    PREV_LD_LIBRARY_PATH=$LD_LIBRARY_PATH
    export LD_LIBRARY_PATH=bin/dlib/
    pushd $CURPATH
    raco exe --embed-dlls -o out/rosette-solver RosetteSolver/rosette-solver.rkt
    raco distribute out/solver out/rosette-solver
    mv out/solver bin/solver
    pushd
    export LD_LIBRARY_PATH=$PREV_LD_LIBRARY_PATH
fi
