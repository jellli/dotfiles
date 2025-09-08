local icons = require("icons")

local diagnostics = {
	"diagnostics",
	sections = { "error", "warn", "info", "hint" },
	symbols = {
		error = icons.diagnostics.ERROR .. " ",
		warn = icons.diagnostics.WARN .. " ",
		info = icons.diagnostics.INFO .. " ",
		hint = icons.diagnostics.HINT .. " ",
	},
	colored = true, -- Displays diagnostics status in color if set to true.
	update_in_insert = false, -- Update diagnostics in insert mode.
	always_visible = true, -- Show diagnostics even if there are none.
}

local overseer = {
	"overseer",
	label = "", -- Prefix for task counts
	colored = true, -- Color the task icons and counts
	unique = false, -- Unique-ify non-running task count by name
	name = nil, -- List of task names to search for
	name_not = false, -- When true, invert the name search
	status = nil, -- List of task statuses to display
	status_not = false, -- When true, invert the status search
}

return {
	"nvim-lualine/lualine.nvim",
	dependencies = {
		"nvim-tree/nvim-web-devicons",
	},
	config = function()
		require("lualine").setup({
			options = {
				icons_enabled = true,
				globalstatus = true,
				component_separators = "",
				section_separators = "",
			},

			sections = {
				lualine_a = {
					"mode",
				},
				lualine_b = { "branch", "diff" },
				lualine_c = {},
				lualine_x = {},
				lualine_y = { "overseer", diagnostics, "filetype" },
				lualine_z = { "progress" },
			},
			extensions = {
				"fzf",
				"lazy",
				"mason",
				"overseer",
				"quickfix",
			},
		})
	end,
}
