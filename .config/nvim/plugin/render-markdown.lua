vim.pack.add({
	"https://github.com/MeanderingProgrammer/render-markdown.nvim",
})
require("render-markdown").setup({
	render_modes = true,
	file_types = { "codecompanion", "codecompanion_input", "markdown", "nvim-pack" },
	sign = { enabled = false },
	completions = {
		lsp = { enabled = true },
		blink = { enabled = true },
	},
	anti_conceal = {
		enabled = false,
	},
	heading = {
		position = "eol",
		sign = false,
		icons = { "一", "二", "三", "四", "五", "六" },
	},
	indent = {
		skip_heading = true,
	},
})
