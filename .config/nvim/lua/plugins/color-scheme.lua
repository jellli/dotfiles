return {
	{
		"EdenEast/nightfox.nvim",
		lazy = false,
		priority = 1000,
		config = function()
			require("nightfox").setup({})
		end,
	},
	{
		"webhooked/kanso.nvim",
		lazy = false,
		priority = 1000,
		config = function()
			require("kanso").setup({
				---@type fun(colors: KansoColorsSpec): table<string, table>
				---@diagnostic disable-next-line: unused-local
				overrides = function(colors)
					return {
						CursorLineNr = { link = "Constant" },
						-- BlinkCmpMenuBorder = { link = "FloatBorder" },
						["@variable"] = { fg = "#a7706a" },
					}
				end,
			})
			vim.cmd("colorscheme kanso-ink")
		end,
	},
	{
		"rebelot/kanagawa.nvim",
		lazy = false,
		priority = 1000,
		config = function()
			require("kanagawa").setup({
				transparent = false,
				terminalColors = true,
				commentStyle = { italic = false },
				overrides = function(colors)
					local theme = colors.theme
					return {
						BlinkCmpMenu = { link = "NormalFloat" }, -- add `blend = vim.o.pumblend` to enable transparency,,
						-- PmenuSel = { fg = "NONE", bg = theme.ui.bg_p2 },
						-- PmenuSbar = { bg = theme.ui.bg_m1 },
						-- PmenuThumb = { bg = "#C0A36E" },
						-- BlinkCmpLabel
						--
						LineNr = { fg = theme.ui.nontext, bg = "NONE" },

						BlinkCmpMenuBorder = { link = "FloatBorder" },

						NormalFloat = { bg = "none" },
						FloatBorder = { bg = "none" },
						FloatTitle = { bg = "none" },
						-- LineNr = { fg = "#C0A36E", bg = "NONE" },
						CursorLineNr = { fg = colors.palette.sakuraPink, bg = "NONE" },
					}
				end,
			})
			-- vim.cmd("colorscheme kanagawa")
		end,
	},
}
