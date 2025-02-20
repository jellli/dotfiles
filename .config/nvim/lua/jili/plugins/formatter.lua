return {
	"stevearc/conform.nvim",
	event = { "BufWritePre" },
	cmd = { "ConformInfo" },
	keys = {
		{
			"<leader>fd",
			function()
				require("conform").format({ async = true, lsp_format = "fallback" })
			end,
			mode = "",
			desc = "[F]ormat [D]ocument",
		},
	},
	config = function()
		local conform = require("conform")
		conform.setup({
			formatters_by_ft = {
				lua = { "stylua" },
				rust = { "rustfmt" },
				css = { "biome" },
				html = { "biome" },
				scss = { "biome" },
				markdown = { "biome" },

				["javascript"] = { "biome" },
				["javascriptreact"] = { "biome" },
				["typescript"] = { "biome" },
				["typescriptreact"] = { "biome" },
			},
			format_on_save = {
				enabled = true,
				lsp_fallback = true,
				async = false,
			},
		})
	end,
}
