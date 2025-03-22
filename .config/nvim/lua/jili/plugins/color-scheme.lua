return {
	--[[ {
		"ilof2/posterpole.nvim",
		priority = 1000,
		config = function()
			local posterpole = require("posterpole")
			posterpole.setup({
				-- config here
				transparent = true,
				dim_inactive = true,
				-- brightness = 9,
			})
			vim.cmd("colorscheme posterpole")

			-- This function create sheduled task, which will reload theme every hour
			-- Without "setup_adaptive" adaptive brightness will be set only after every restart
			posterpole.setup_adaptive()
		end,
	}, ]]
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
			vim.cmd.colorscheme("tokyonight-night")
		end,
	},
}
