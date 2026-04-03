---@diagnostic disable: missing-fields
local function load()
	vim.pack.add({
		"https://github.com/lewis6991/gitsigns.nvim",
		"https://github.com/tpope/vim-fugitive",
		"https://github.com/esmuellert/codediff.nvim",
	})

	local gs = require("gitsigns")
	gs.setup({
		current_line_blame = false,
		gh = true,
		on_attach = function()
			local keymap = Jili.keymap
			keymap("n", "[h", function()
				gs.nav_hunk("prev", {
					navigation_message = false,
				})
			end, "Previous hunk")
			keymap("n", "]h", function()
				gs.nav_hunk("next", {
					navigation_message = false,
				})
			end, "Next hunk")

			keymap("n", "<leader>gb", gs.blame, "Blame line")
			keymap("n", "<leader>tlb", gs.toggle_current_line_blame, "Toggle current line blame")
			keymap("n", "<leader>twb", gs.toggle_word_diff, "Toggle word diff")
			keymap("n", "<leader>hp", gs.preview_hunk_inline, "Preview hunk")
			keymap("n", "<leader>hs", gs.stage_hunk, "Stage hunk")
			keymap("n", "<leader>hr", gs.reset_hunk, "Reset hunk")

			keymap("n", "<leader>ge", "<cmd>Gedit<cr>", "Git edit")
			keymap("n", "<leader>gs", "<cmd>vert Git<cr>", "Git status")
			keymap("n", "<leader>ga", "<cmd>Git add %<cr>", "Git add current file")
			keymap("n", "<leader>gw", "<cmd>Gwrite<cr>", "Git write")
			keymap("n", "<leader>gr", "<cmd>Gread<cr>", "Git read")
			keymap("n", "<leader>gc", "<cmd>Git commit -v -q<cr>", "Git commit")
			keymap("n", "<leader>gt", "<cmd>Git commit -v -q %:p<cr>", "Git commit current file")
			keymap("n", "<leader>gd", "<cmd>Gvdiffsplit<cr>", "Git diff")
			keymap(
				"n",
				"<leader>gl",
				"<cmd>vert Git --paginate log --graph --pretty=format:'%C(magenta)%h %C(white) %an (%ar)%C(auto) %D%n%s%n'<cr>",
				"Git log"
			)
			keymap("n", "<leader>gP", "<cmd>Git push<cr>", "Git push")
			keymap("n", "<leader>gp", "<cmd>Git pull<cr>", "Git pull")
		end,
	})
end

vim.schedule(load)
