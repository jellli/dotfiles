return {
	"numToStr/Comment.nvim",
	event = { "BufReadPre", "BufNewFile" },
	name = "comment.nvim",
	dependencies = { "JoosepAlviste/nvim-ts-context-commentstring" },
	config = function()
		vim.g.skip_ts_context_commentstring_module = true

		require("Comment").setup({
			pre_hook = require("ts_context_commentstring.integrations.comment_nvim").create_pre_hook(),
		})

		require("ts_context_commentstring").setup({
			enable_autocmd = false,
			padding = true,
			mappings = {
				basic = true,
				extra = false,
			},
		})

		 -- stylua: ignore start
		vim.keymap.set( "v", "<C-_>", "<esc><cmd>lua require('Comment.api').toggle.linewise(vim.fn.visualmode())<cr>", opts)
		vim.keymap.set( "v", "<C-/>", "<esc><cmd>lua require('Comment.api').toggle.linewise(vim.fn.visualmode())<cr>", opts)
		vim.keymap.set({ "n", "i" }, "<C-_>", require("Comment.api").toggle.linewise.current, opts)
		vim.keymap.set({ "n", "i" }, "<C-/>", require("Comment.api").toggle.linewise.current, opts)
		-- stylua: ignore end
	end,
}
