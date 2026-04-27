local function load()
	vim.pack.add({
		"https://github.com/nvim-mini/mini.ai",
	})

  local miniai = require("mini.ai")
	miniai.setup({
		custom_textobjects = {
      f = miniai.gen_spec.treesitter({ a = '@function.outer', i = '@function.inner' }, {}),
			g = function()
				local from = { line = 1, col = 1 }
				local to = {
					line = vim.fn.line("$"),
					col = math.max(vim.fn.getline("$"):len(), 1),
				}
				return { from = from, to = to }
			end,
		},
    silent = true
	})
end

vim.schedule(load)
