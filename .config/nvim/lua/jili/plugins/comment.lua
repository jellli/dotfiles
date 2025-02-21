-- Easily comment visual regions/lines
return {
	"numToStr/Comment.nvim",
	opts = {},
	config = function()
		local opts = { noremap = true, silent = true }
		vim.keymap.set(
			"v",
			"<C-_>",
			"<esc><cmd>lua require('Comment.api').toggle.linewise(vim.fn.visualmode())<cr>",
			opts
		)
		vim.keymap.set(
			"v",
			"<C-/>",
			"<esc><cmd>lua require('Comment.api').toggle.linewise(vim.fn.visualmode())<cr>",
			opts
		)
		vim.keymap.set({ "n", "i" }, "<C-_>", require("Comment.api").toggle.linewise.current, opts)
		vim.keymap.set({ "n", "i" }, "<C-/>", require("Comment.api").toggle.linewise.current, opts)
	end,
}
