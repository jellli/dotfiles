local function load()
	vim.pack.add({
		"https://github.com/nvim-mini/mini.ai",
	})

	require("mini.ai").setup({
		g = function()
			local from = { line = 1, col = 1 }
			local to = {
				line = vim.fn.line("$"),
				col = math.max(vim.fn.getline("$"):len(), 1),
			}
			return { from = from, to = to }
		end,
	})
end

vim.schedule(load)
