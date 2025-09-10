-- Split/join blocks of code.
return {
	{
		"nvim-mini/mini.splitjoin",
		keys = {
			{
				"<leader>sj",
				function()
					require("mini.splitjoin").toggle()
				end,
				desc = "Join/split code block",
			},
		},
		opts = {
			mappings = {
				toggle = "<leader>sj",
			},
		},
	},
}
