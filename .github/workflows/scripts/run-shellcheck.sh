#!/bin/bash

docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:v0.7.1 -P ./bin/ -x ./.github/workflows/scripts/*.sh