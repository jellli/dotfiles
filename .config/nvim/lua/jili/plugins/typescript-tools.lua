return {
	"pmizio/typescript-tools.nvim",
	dependencies = { "nvim-lua/plenary.nvim", "neovim/nvim-lspconfig" },
	opts = {
		settings = {
			separate_diagnostic_server = true,
			publish_diagnostic_on = "insert_leave",
			tsserver_locale = "zh-cn",
			expose_as_code_action = "all",
		},
	},
}
