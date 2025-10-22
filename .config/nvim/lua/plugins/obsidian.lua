return {
  {
    -- "epwalsh/obsidian.nvim",
    "obsidian-nvim/obsidian.nvim",
    version = "*",
    lazy = true,
    ft = "markdown",
    cmd = {
      "Obsidian",
    },
    keys = {
      {
        "<leader>obt",
        "<cmd>Obsidian new_from_template<cr>",
        mode = "n",
        desc = "Obsidian: New from Template",
      },
    },
    dependencies = {
      "nvim-lua/plenary.nvim",
      "ibhagwan/fzf-lua",
    },
    opts = {
      workspaces = {
        {
          name = "Jili",
          path = "~/vaults/jili",
        },
      },
      templates = {
        folder = "templates",
        date_format = "%Y-%m-%d-%a",
        customizations = {
          reading = {
            notes_subdir = "readings",
            note_id_func = function(title)
              return title
            end,
          },
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
    },
  },
  {
    "ibhagwan/fzf-lua",
    keys = {
      {
        "<leader>obf",
        function()
          require("fzf-lua").files({
            cwd = "~/vaults/jili",
          })
        end,
        desc = "Obsidian: FZF Files in Vault",
      },
    },
  },
}
