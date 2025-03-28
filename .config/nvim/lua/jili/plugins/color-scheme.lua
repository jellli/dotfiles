return {
	{
		"rebelot/kanagawa.nvim",
		lazy = false,
		priority = 1000,
		config = function()
			require("kanagawa").setup({
				transparent = true,
				terminalColors = false,
				colors = {
					theme = {
						all = {
							ui = {
								bg_gutter = "none",
							},
						},
					},
				},
				overrides = function(colors)
					local theme = colors.theme
					return {
						NormalFloat = { bg = "none" },
						FloatBorder = { bg = "none" },
						FloatTitle = { bg = "none" },

						-- Save an hlgroup with dark background and dimmed foreground
						-- so that you can use it where your still want darker windows.
						-- E.g.: autocmd TermOpen * setlocal winhighlight=Normal:NormalDark
						NormalDark = { fg = theme.ui.fg_dim, bg = theme.ui.bg_m3 },

						-- Popular plugins that open floats will link to NormalFloat by default;
						-- set their background accordingly if you wish to keep them dark and borderless
						LazyNormal = { bg = theme.ui.bg_m3, fg = theme.ui.fg_dim },
						MasonNormal = { bg = theme.ui.bg_m3, fg = theme.ui.fg_dim },
					}
				end,
			})
			vim.cmd.colorscheme("kanagawa")
		end,
	},
	-- {
	-- 	"ellisonleao/gruvbox.nvim",
	-- 	lazy = false,
	-- 	priority = 1000,
	-- 	opts = {},
	-- },
	-- {
	-- 	"sainnhe/everforest",
	-- 	lazy = false,
	-- 	priority = 1000,
	-- 	config = function()
	-- 		vim.g.everforest_background = "hard"
	-- 		vim.g.everforest_transparent_background = 2
	-- 		vim.g.everforest_enable_italic = true
	-- 		vim.g.everforest_cursor = "orange"
	-- 		-- vim.cmd.colorscheme("everforest")
	-- 	end,
	-- },
	-- {
	-- 	"sainnhe/gruvbox-material",
	-- 	lazy = false,
	-- 	priority = 1000,
	-- 	config = function()
	-- 		vim.g.gruvbox_material_inlay_hints_background = "none"
	-- 		vim.g.gruvbox_material_transparent_background = 2
	-- 		vim.g.gruvbox_material_cursor = "orange"
	-- 		vim.g.gruvbox_material_better_performance = 1
	-- 		vim.g.gruvbox_material_foreground = "material"
	-- 		vim.g.gruvbox_material_background = "soft"
	-- 		vim.g.gruvbox_material_ui_contrast = "low"
	-- 		vim.g.gruvbox_material_float_style = "dim"
	-- 		vim.g.gruvbox_material_enable_italic = 1
	-- 		vim.g.gruvbox_material_disable_italic_comment = 0
	-- 		vim.g.gruvbox_material_disable_terminal_colors = 1
	-- 		vim.g.gruvbox_material_enable_bold = 1
	-- 		-- vim.cmd.colorscheme("gruvbox-material")
	-- 	end,
	-- },
	-- {
	-- 	"folke/tokyonight.nvim",
	-- 	lazy = false,
	-- 	priority = 1000,
	-- 	config = function()
	-- 		---@diagnostic disable-next-line: missing-fields
	-- 		require("tokyonight").setup({
	-- 			-- transparent = true,
	-- 			style = "night",
	-- 			lualine_bold = true,
	-- 			styles = {
	-- 				dim_inactive = true,
	-- 				-- 筛选器表单字段定义
	-- 				sidebars = "transparent",
	-- 				floats = "transparent",
	-- 				comments = { italic = true },
	-- 				keywords = { italic = true, bold = true },
	-- 				functions = { italic = true, fg = "#74ade9" },
	-- 				variables = {
	-- 					fg = "#dfc184",
	-- 				},
	-- 			},
	-- 		})
	-- 		-- vim.cmd.colorscheme("tokyonight-night")
	-- 	end,
	-- },
}
