-- Better text objects.
return {
	{
		"nvim-mini/mini.ai",
		event = "BufReadPre",
		dependencies = "nvim-treesitter/nvim-treesitter-textobjects",
		config = function()
			local miniai = require("mini.ai")
			miniai.setup({
				n_lines = 300,
				custom_textobjects = {
					f = miniai.gen_spec.treesitter({ a = "@function.outer", i = "@function.inner" }, {}),
					-- Whole buffer.
					g = function()
						local from = { line = 1, col = 1 }
						local to = {
							line = vim.fn.line("$"),
							col = math.max(vim.fn.getline("$"):len(), 1),
						}
						return { from = from, to = to }
					end,
				},
				-- Disable error feedback.
				silent = true,
			})
		end,
	},
}
