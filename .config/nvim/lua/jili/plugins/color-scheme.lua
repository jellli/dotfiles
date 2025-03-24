return {
	{
		"sainnhe/everforest",
		lazy = false,
		priority = 1000,
		config = function()
			vim.g.everforest_background = "hard"
			vim.g.everforest_transparent_background = 2
			vim.g.everforest_enable_italic = true
			vim.g.everforest_cursor = "orange"
			-- vim.cmd.colorscheme("everforest")
		end,
	},
	{
		"sainnhe/gruvbox-material",
		lazy = false,
		priority = 1000,
		config = function()
			vim.g.gruvbox_material_inlay_hints_background = "none"
			vim.g.gruvbox_material_transparent_background = 2
			vim.g.gruvbox_material_cursor = "orange"

			vim.g.gruvbox_material_better_performance = 1
			vim.g.gruvbox_material_foreground = "material"
			vim.g.gruvbox_material_background = "soft"
			vim.g.gruvbox_material_ui_contrast = "low"
			vim.g.gruvbox_material_float_style = "dim"
			vim.g.gruvbox_material_enable_italic = 0
			vim.g.gruvbox_material_disable_italic_comment = 1
			vim.g.gruvbox_material_disable_terminal_colors = 1
			vim.cmd.colorscheme("gruvbox-material")
		end,
	},
	{
		"folke/tokyonight.nvim",
		lazy = false,
		priority = 1000,
		config = function()
			---@diagnostic disable-next-line: missing-fields
			require("tokyonight").setup({
				-- transparent = true,
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
			-- vim.cmd.colorscheme("tokyonight-night")
		end,
	},
}
