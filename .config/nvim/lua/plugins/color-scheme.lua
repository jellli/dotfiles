return {
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
					return {
						BlinkCmpMenu = { bg = colors.palette.dragonBlack3 },
						BlinkCmpLabelDetail = { bg = colors.palette.dragonBlack3 },
						BlinkCmpMenuSelection = { bg = colors.palette.waveBlue1 },
					}
				end,
			})
			vim.cmd("colorscheme kanagawa")
		end,
	},
}
