return {
	-- "epwalsh/obsidian.nvim",
	"adamtajti/obsidian.nvim",
	-- version = "*", -- recommended, use latest release instead of latest commit
	branch = "blink-support",
	lazy = true,
	ft = "markdown",
	-- Replace the above line with this if you only want to load obsidian.nvim for markdown files in your vault:
	-- event = {
	--   -- If you want to use the home shortcut '~' here you need to call 'vim.fn.expand'.
	--   -- E.g. "BufReadPre " .. vim.fn.expand "~" .. "/my-vault/*.md"
	--   -- refer to `:h file-pattern` for more examples
	--   "BufReadPre path/to/my-vault/*.md",
	--   "BufNewFile path/to/my-vault/*.md",
	-- },
	dependencies = {
		-- Required.
		"nvim-lua/plenary.nvim",

		-- see below for full list of optional dependencies 👇
	},
	config = function()
		require("obsidian").setup({
			workspaces = {
				{
					name = "Jili",
					path = "~/vaults/jili",
				},
			},
			---@diagnostic disable-next-line: missing-fields
			completion = {
				nvim_cmp = false,
				blink = true,
			},
			notes_subdir = "notes",
			new_notes_location = "notes_subdir",
			note_frontmatter_func = function(note)
				local out = note.frontmatter(note)
				if out.created == nil then
					out.created = os.date("%Y-%m-%d %H:%M:%S")
				end
				out.modified = os.date("%Y-%m-%d %H:%M:%S")

				return out
			end,
		})
	end,
}
