#!/usr/bin/env node
// Committed entry point, so package managers can link the `easy-cms` command at install time,
// before `dist/` is built (fresh clones of the monorepo).
import '../dist/bin.js'
