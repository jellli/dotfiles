return {
	{
		"folke/tokyonight.nvim",
		lazy = false,
		priority = 1000,
		config = function()
			---@diagnostic disable-next-line: missing-fields
			require("tokyonight").setup({
				transparent = true,
				style = "night",
				lualine_bold = true,
				styles = {
					dim_inactive = true,
					sidebars = "transparent",
					floats = "transparent",
					comments = { italic = true },
					keywords = { italic = true, bold = true },
					functions = { italic = true, fg = "#74ade9" },
					variables = {
						fg = "#dfc184",
					},
				},
			})
			vim.cmd.colorscheme("tokyonight-night")
		end,
	},
}
