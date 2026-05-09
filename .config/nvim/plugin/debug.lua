require("pack").add({
	{
		src = "https://github.com/dstein64/vim-startuptime",
		before = function()
			vim.g.startuptime_tries = 10
		end,
	},
})
