return {
	--[[ {
		"pmizio/typescript-tools.nvim",
		dependencies = { "nvim-lua/plenary.nvim", "neovim/nvim-lspconfig" },
		opts = {
			settings = {
				separate_diagnostic_server = true,
				publish_diagnostic_on = "insert_leave",
				tsserver_locale = "zh-cn",
				expose_as_code_action = {
					"add_missing_imports",
					"remove_unused",
					"remove_unused_imports",
				},
			},
		},
	}, ]]
	{
		event = "InsertEnter",
		"windwp/nvim-ts-autotag",
		config = function()
			require("nvim-ts-autotag").setup({
				opts = {
					enable_close = true, -- Auto close tags
					enable_rename = true, -- Auto rename pairs of tags
					enable_close_on_slash = true, -- Auto close on trailing </
				},
			})
		end,
	},
	{
		-- Autoclose parentheses, brackets, quotes, etc.
		"windwp/nvim-autopairs",
		event = "InsertEnter",
		config = true,
		opts = {},
	},
	{
		-- High-performance color highlighter
		"norcalli/nvim-colorizer.lua",
		opts = {
			filetypes = {
				"css",
				js = { names = false },
				lua = { names = false },
				markdown = { names = false },
				text = { names = false },
			},
		},
	},
	{ "dmmulroy/ts-error-translator.nvim" },
	{
		"Wansmer/symbol-usage.nvim",
		event = "LspAttach",
		opts = {
			text_format = function(symbol)
				local res = {}

				if symbol.references then
					local usage = symbol.references == 1 and "reference" or "references"
					table.insert(res, { ("󰌹  %s %s"):format(symbol.references, usage), "LspCodeLens" })
				end

				return res
			end,
		},
	},
}
