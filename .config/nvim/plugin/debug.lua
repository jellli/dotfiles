local later = require("q").later

later(function()
	vim.g.startuptime_tries = 10
	vim.pack.add({
		"https://github.com/dstein64/vim-startuptime",
	})
end)
