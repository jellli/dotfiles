require("pack").add({
	{
		src = "https://github.com/stevearc/conform.nvim",
		event = "BufReadPost",
		after = function()
			require("conform").setup({
				format_on_save = {
					timeout_ms = 500,
					lsp_fallback = true,
				},
				default_format_opts = {
					lsp_format = "fallback",
				},
				formatters_by_ft = {
					lua = { "stylua" },
					typescript = { "prettier" },
					typescriptreact = { "prettier" },
					javascript = { "prettier" },
					javascriptreact = { "prettier" },
					html = { "prettier" },
					css = { "prettier" },
					scss = { "prettier" },
					less = { "prettier" },
				},
			})
		end,
	},
})

