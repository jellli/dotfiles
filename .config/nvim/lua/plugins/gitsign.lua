local solid_bar = require("icons").misc.vertical_bar
local dashed_bar = require("icons").misc.dashed_bar

-- Adds git releated signs to the gutter, as well as utilities for managing changes.
return {
	{
		"lewis6991/gitsigns.nvim",
		event = { "BufReadPre", "BufNewFile" },
		opts = {
			signs = {
				add = { text = solid_bar },
				untracked = { text = solid_bar },
				change = { text = solid_bar },
				delete = { text = solid_bar },
				topdelete = { text = solid_bar },
				changedelete = { text = solid_bar },
			},
			signs_staged = {
				add = { text = dashed_bar },
				untracked = { text = dashed_bar },
				change = { text = dashed_bar },
				delete = { text = dashed_bar },
				topdelete = { text = dashed_bar },
				changedelete = { text = dashed_bar },
			},
			-- preview_config = { border = "rounded" },
			current_line_blame = true,
			gh = true,
			on_attach = function(bufnr)
				local gs = package.loaded.gitsigns

				-- Register the leader group with miniclue.
				vim.b[bufnr].miniclue_config = {
					clues = {
						{ mode = "n", keys = "<leader>g", desc = "+git" },
						{ mode = "x", keys = "<leader>g", desc = "+git" },
					},
				}

				Map("[g", gs.prev_hunk, { desc = "Previous hunk" })
				Map("]g", gs.next_hunk, { desc = "Next hunk" })
			end,
		},
	},
}
