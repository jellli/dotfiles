vim.lsp.config("jsonls", {
	settings = {
		json = {
			schemas = require("schemastore").json.schemas(),
			validate = { enable = true },
		},
	},
})

vim.lsp.config("yamlls", {
	settings = {
		yaml = {
			schemaStore = {
				-- You must disable built-in schemaStore support if you want to use
				-- this plugin and its advanced options like `ignore`.
				enable = false,
				-- Avoid TypeError: Cannot read properties of undefined (reading 'length')
				url = "",
			},
			schemas = require("schemastore").yaml.schemas(),
		},
	},
})

vim.lsp.config("vtsls", {
	settings = {
		complete_function_calls = true,
		vtsls = {
			enableMoveToFileCodeAction = true,
			autoUseWorkspaceTsdk = true,
			experimental = {
				maxInlayHintLength = 30,
				completion = {
					enableServerSideFuzzyMatch = true,
				},
			},
		},
		typescript = {
			updateImportsOnFileMove = { enabled = "always" },
			suggest = {
				completeFunctionCalls = true,
			},
			-- locale = "zh-CN",
			tsserver = {
				maxTsServerMemory = 8 * 1024,
			},
			inlayHints = {
				enumMemberValues = { enabled = true },
				functionLikeReturnTypes = { enabled = true },
				parameterNames = { enabled = "literals" },
				parameterTypes = { enabled = true },
				propertyDeclarationTypes = { enabled = true },
				variableTypes = { enabled = false },
			},
		},
	},
})

vim.lsp.config("zls", {
	settings = {
		zls = {
			enable_inlay_hints = true,
			inlay_hints_show_builtin = true,
			inlay_hints_exclude_single_argument = true,
			inlay_hints_hide_redundant_param_names = false,
			inlay_hints_hide_redundant_param_names_last_token = false,

			enable_build_on_save = true,
			-- build_on_save_step = "check",
		},
	},
})

vim.lsp.config("emmet_ls", {
	init_options = {
		jsx = {
			options = {
				["jsx.enabled"] = true,
				["markup.attributes"] = {
					["class"] = "className",
					["class*"] = "className",
					["for"] = "htmlFor",
				},
				["markup.valuePrefix"] = {
					["class*"] = "styles",
				},
			},
		},
	},
})

vim.lsp.config("tsgo", {
	settings = {
		typescript = {
			locale = "zh-CN",
		},
	},
})

vim.lsp.enable({
	"lua_ls",
	"vtsls",
	-- "tsgo",
	"cssls",
	"cssmodules_ls",
	"emmet_ls",
	"marksman",
	"zls",
	-- "biome",
	"tailwindcss",
	"rust_analyzer",
	"jsonls",
	"yamlls",
	"css-variables-language-server",
})
