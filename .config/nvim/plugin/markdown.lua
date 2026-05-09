require("pack").add({
	{
		src = "https://github.com/MeanderingProgrammer/render-markdown.nvim",
		event = "FileType",
		filetype = { "codecompanion", "codecompanion_input", "markdown", "nvim-pack", "AgenticChat" },
		id = "render-markdown",
		after = function()
			require("render-markdown").setup({
				render_modes = { "n", "v", "c", "t" },
				file_types = { "codecompanion", "codecompanion_input", "markdown", "nvim-pack", "AgenticChat" },
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
					width = "full",
					border = true,
					left_pad = 1,
				},
				code = {
					border = "thin",
				},
				checkbox = {
					enabled = true,
				},
				indent = {
					skip_heading = true,
				},
				bold = {
					enabled = true,
				},
			})
		end,
	},
})
