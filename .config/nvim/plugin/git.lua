---@diagnostic disable: missing-fields
local function load()
	vim.pack.add({
		"https://github.com/lewis6991/gitsigns.nvim",
		"https://github.com/tpope/vim-fugitive",
		"https://github.com/esmuellert/codediff.nvim",
	})

	require("gitsigns").setup({
		current_line_blame = false,
		gh = true,
	})

	local keymap = Jili.keymap
	keymap("n", "[c", "<cmd>Gitsigns nav_hunk prev --target=all --navigation_message=false<cr>", "Previous hunk")
	keymap("n", "]c", "<cmd>Gitsigns nav_hunk next --target=all --navigation_message=false<cr>", "Next hunk")

	keymap("n", "<leader>gb", "<cmd>Gitsigns blame<cr>", "Blame line")
	keymap("n", "<leader>hp", "<cmd>Gitsigns preview_hunk_inline<cr>", "Preview hunk")
	keymap("n", "<leader>hs", "<cmd>Gitsigns stage_hunk<cr>", "Stage hunk")
	keymap("n", "<leader>hr", "<cmd>Gitsigns reset_hunk<cr>", "Reset hunk")

	keymap("n", "<leader>gg", "<cmd>Git<cr>", "Git status")

	keymap("n", "<leader>gw", "<cmd>Gwrite<cr>", "Git write current buffer(stage)")
	keymap("n", "<leader>gr", "<cmd>Gread<cr>", "Git read (reset)")

	keymap("n", "<leader>gc", "<cmd>Git commit -v -q<cr>", "Git commit")
	keymap("n", "<leader>gh", "<cmd>CodeDiff history<cr>", "Git history")
	keymap("n", "<leader>gl", "<cmd>vert Git log --oneline --graph<cr>", "Git log")

	keymap("n", "<leader>gP", "<cmd>Git push<cr>", "Git push")
	keymap("n", "<leader>gp", "<cmd>Git pull<cr>", "Git pull")
end

vim.schedule(load)
