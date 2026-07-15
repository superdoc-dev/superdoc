.PHONY: install dev test clean

DEMO_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
ROOT := $(abspath $(DEMO_DIR)/../..)
PNPM := pnpm
BUN := $(DEMO_DIR)/mcp-server/node_modules/.bin/bun

install: ## Install all monorepo and demo dependencies
	cd $(ROOT) && $(PNPM) install

dev: ## Start the client, room server, Yjs relay, and MCP server
	$(PNPM) exec concurrently -k \
		-n CLIENT,ROOMS,COLLAB,MCP \
		-c green,magenta,cyan,blue \
		"cd $(DEMO_DIR)/client && $(PNPM) run dev" \
		"cd $(DEMO_DIR)/room-server && $(PNPM) run dev" \
		"cd $(DEMO_DIR)/room-server && HOST=127.0.0.1 PORT=8081 $(PNPM) exec y-websocket" \
		"cd $(DEMO_DIR)/mcp-server && $(PNPM) run dev"

test: ## Run deterministic checks; no model key or external service required
	cd $(ROOT) && $(PNPM) --filter superdoc run build
	cd $(ROOT) && $(PNPM) --filter @superdoc-dev/mcp run typecheck
	PATH="$(DEMO_DIR)/mcp-server/node_modules/.bin:$$PATH" NODE_ENV=test \
		$(BUN) test $(abspath $(ROOT)/apps/mcp/src)
	$(PNPM) --dir $(DEMO_DIR)/mcp-server run typecheck
	$(PNPM) --dir $(DEMO_DIR)/mcp-server run test
	$(PNPM) --dir $(DEMO_DIR)/room-server run typecheck
	$(PNPM) --dir $(DEMO_DIR)/client run test
	$(PNPM) --dir $(DEMO_DIR)/client run build
	@if rg -n "OPENAI_API_KEY|from ['\"]openai['\"]" $(DEMO_DIR)/client \
		$(DEMO_DIR)/room-server $(DEMO_DIR)/mcp-server; then \
		echo "OpenAI dependency found in MCP demo"; exit 1; \
	fi

clean: ## Remove demo-local installations and client build output
	rm -rf $(DEMO_DIR)/client/node_modules $(DEMO_DIR)/room-server/node_modules \
		$(DEMO_DIR)/mcp-server/node_modules $(DEMO_DIR)/client/dist
