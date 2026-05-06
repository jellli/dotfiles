require("pack").add({
	{
		src = {
			"https://github.com/dstein64/vim-startuptime",
			"https://github.com/tpope/vim-repeat",
		},
		before = function()
			vim.g.startuptime_tries = 10
		end,
	},
})
