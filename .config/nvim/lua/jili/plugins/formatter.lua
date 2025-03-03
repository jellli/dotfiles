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
				css = { "prettier" },
				html = { "prettier" },
				scss = { "prettier" },
				markdown = { "prettier" },

				["javascript"] = { "prettier" },
				["javascriptreact"] = { "prettier" },
				["typescript"] = { "prettier" },
				["typescriptreact"] = { "prettier" },
			},
			format_on_save = {
				enabled = true,
				lsp_fallback = true,
				async = false,
			},
		})
	end,
}
