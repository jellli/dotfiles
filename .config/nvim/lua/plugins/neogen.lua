return {
	"danymat/neogen",
	config = function()
		require("neogen").setup({ snippet_engine = "luasnip" })
	end,
	keys = {
		"n",
		{
			"<leader>ndf",
			function()
				require("neogen").generate({ type = "func" })
			end,
			desc = "neogen generate docstring",
		},
		{
			"<leader>ndc",
			function()
				require("neogen").generate({ type = "class" })
			end,
			desc = "neogen generate docstring",
		},
		{
			"<leader>ndt",
			function()
				require("neogen").generate({ type = "type" })
			end,
			desc = "neogen generate docstring",
		},
	},
}
