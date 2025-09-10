return {
	"danymat/neogen",
	config = true,
	-- Uncomment next line if you want to follow only stable versions
	-- version = "*"
	keys = {
		"n",
		{
			"<leader>nd",
			function()
				require("neogen").generate()
			end,
			desc = "neogen generate docstring",
		},
	},
}
