return {
  -- "epwalsh/obsidian.nvim",
  "obsidian-nvim/obsidian.nvim",
  version = "3.12.*", -- recommended, use latest release instead of latest commit
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
    "nvim-lua/plenary.nvim",
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
