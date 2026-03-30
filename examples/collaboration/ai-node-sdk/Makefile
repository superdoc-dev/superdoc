.PHONY: install dev dev-local dev-server dev-client link-local-sdk rebuild-local-sdk restore-npm-sdk kill clean help

# ─── Config ───────────────────────────────────────────────────────────────────

PNPM := pnpm
ROOT := $(shell cd ../../.. && pwd)
SDK_SRC := $(ROOT)/packages/sdk/langs/node
CLI_SRC := $(ROOT)/apps/cli
CLI_ARTIFACT = $(CLI_SRC)/artifacts/$(CLI_TARGET)/$(CLI_BINARY)

# Platform detection for CLI binary
UNAME_S := $(shell uname -s)
UNAME_M := $(shell uname -m)
ifeq ($(UNAME_S),Darwin)
  ifeq ($(UNAME_M),arm64)
    CLI_TARGET := darwin-arm64
  else
    CLI_TARGET := darwin-x64
  endif
else ifeq ($(UNAME_S),Linux)
  ifeq ($(UNAME_M),aarch64)
    CLI_TARGET := linux-arm64
  else
    CLI_TARGET := linux-x64
  endif
endif
CLI_BINARY := superdoc
CLI_PKG := @superdoc-dev/sdk-$(CLI_TARGET)

# ─── Default ──────────────────────────────────────────────────────────────────

help: ## Show this help
	@echo ""
	@echo "  SuperDoc AI Agent Example"
	@echo "  ─────────────────────────"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ─── Setup ────────────────────────────────────────────────────────────────────

install: check-env ## Install all dependencies (SDK from npm)
	@echo "Installing server dependencies..."
	@cd server && npm install
	@echo "Installing client dependencies..."
	@cd client && $(PNPM) install
	@echo ""
	@echo "✓ Dependencies installed. Run 'make dev' to start."

check-env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo ""; \
		echo "  ⚠  Created .env from template. Add your OpenAI API key:"; \
		echo "    OPENAI_API_KEY=sk-..."; \
		echo ""; \
		exit 1; \
	fi
	@grep -q "OPENAI_API_KEY=sk-" .env 2>/dev/null || { \
		echo "  ⚠  OPENAI_API_KEY not set in .env"; \
		exit 1; \
	}

# ─── Development ──────────────────────────────────────────────────────────────

kill: ## Kill any running instances
	@-pkill -f "y-websocket" 2>/dev/null || true
	@-pkill -f "tsx watch.*ai-node-sdk" 2>/dev/null || true
	@-pkill -f "vite.*ai-node-sdk" 2>/dev/null || true
	@-pkill -f "superdoc.*host" 2>/dev/null || true
	@sleep 1

dev: check-env kill restore-npm-sdk ## Start with npm SDK (default)
	@echo ""
	@echo "  Server → http://localhost:8090 + ws://localhost:8081"
	@echo "  Client → http://localhost:5173"
	@echo ""
	@npx concurrently -k \
		-n SERVER,CLIENT \
		-c magenta,green \
		"cd server && npm run dev" \
		"cd client && $(PNPM) run dev"

dev-local: check-env kill link-local-sdk ## Start with local SDK (built from monorepo)
	@echo ""
	@echo "  Server → http://localhost:8090 + ws://localhost:8081 (local SDK)"
	@echo "  Client → http://localhost:5173"
	@echo ""
	@npx concurrently -k \
		-n SERVER,CLIENT \
		-c magenta,green \
		"cd server && npm run dev" \
		"cd client && $(PNPM) run dev"

dev-server: check-env ## Start server only
	cd server && npm run dev

dev-client: ## Start client only
	cd client && $(PNPM) run dev

restore-npm-sdk: ## Restore SDK from npm if currently symlinked
	@if [ -L server/node_modules/@superdoc-dev/sdk ]; then \
		echo "  Restoring npm SDK (removing local symlink)..."; \
		rm -f server/node_modules/@superdoc-dev/sdk; \
		cd server && npm install --prefer-offline --no-audit --no-fund 2>/dev/null; \
		echo "  ✓ npm SDK restored"; \
	fi

# ─── Local SDK ────────────────────────────────────────────────────────────────

link-local-sdk: ## Build and link local SuperDoc SDK + CLI
	@echo "Linking local SuperDoc SDK ($(CLI_TARGET))..."
	@# 1. Build CLI native binary if not already built
	@if [ ! -f $(CLI_ARTIFACT) ]; then \
		echo "  Building CLI binary..."; \
		cd $(ROOT) && $(PNPM) --filter @superdoc-dev/cli run build:native:host; \
	else \
		echo "  CLI binary found"; \
	fi
	@# 2. Ensure server node_modules exists
	@if [ ! -d server/node_modules ]; then \
		echo "  Installing server deps first..."; \
		cd server && npm install; \
	fi
	@# 3. Replace npm SDK with symlink to workspace source
	@rm -rf server/node_modules/@superdoc-dev/sdk
	@ln -sf $(SDK_SRC) server/node_modules/@superdoc-dev/sdk
	@echo "  ✓ Linked SDK → $(SDK_SRC)"
	@# 4. Place CLI binary where the workspace SDK can find it via require.resolve
	@#    Node follows the symlink real path, so the binary must be in the
	@#    workspace SDK's own node_modules, not the server's.
	@mkdir -p $(SDK_SRC)/node_modules/$(CLI_PKG)/bin
	@cp $(CLI_ARTIFACT) $(SDK_SRC)/node_modules/$(CLI_PKG)/bin/$(CLI_BINARY)
	@chmod +x $(SDK_SRC)/node_modules/$(CLI_PKG)/bin/$(CLI_BINARY)
	@echo "  ✓ Linked CLI binary"
	@echo "✓ Local SDK ready"

rebuild-local-sdk: ## Rebuild CLI binary and re-link
	@echo "Rebuilding CLI binary..."
	@cd $(ROOT) && $(PNPM) --filter @superdoc-dev/cli run build:native:host
	@mkdir -p $(SDK_SRC)/node_modules/$(CLI_PKG)/bin
	@cp $(CLI_ARTIFACT) $(SDK_SRC)/node_modules/$(CLI_PKG)/bin/$(CLI_BINARY)
	@chmod +x $(SDK_SRC)/node_modules/$(CLI_PKG)/bin/$(CLI_BINARY)
	@echo "✓ CLI binary updated"

# ─── Cleanup ──────────────────────────────────────────────────────────────────

clean: ## Remove node_modules and build artifacts
	rm -rf server/node_modules client/node_modules
	rm -rf client/dist
	@echo "✓ Cleaned"
