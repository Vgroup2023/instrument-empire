# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**instrument-empire** is a project with a dashboard component referred to as `instrument-empire-dash`. As of the initial commit, the repository is in its earliest setup phase — no source code, build system, or tooling has been added yet.

## Current State

The repository contains only a `README.md`. Before any development work can begin, the following foundational decisions need to be made and documented here:

- **Tech stack** — language(s), framework(s), runtime
- **Build system** — how to compile/bundle the project
- **Test framework** — how to run tests (full suite and individual tests)
- **Linting/formatting** — code style enforcement tools and commands
- **Project structure** — where source, tests, and config live

## Updating This File

Once the stack and tooling are established, replace the "Current State" section above with:

1. **Commands** — exact commands for build, lint, test, and running a single test
2. **Architecture** — how the major modules connect and data flows through the system
3. **Key conventions** — patterns specific to this codebase that aren't obvious from reading individual files
