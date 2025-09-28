require("utils")

return {
  "ibhagwan/fzf-lua",
  dependencies = { "nvim-tree/nvim-web-devicons" },
  config = function()
    local fzf = require("fzf-lua")
    fzf.register_ui_select()

    fzf.setup({
      "hide",
      winopts = {
        border = "single",
        height = 15,
        width = 76,
        row = 0.2,
        col = 0.5,
        preview = {
          hidden = true,
        },
      },
      hls = {
        title = "Constant",
        border = "FloatBorder",
        preview_border = "FloatBorder",
      },
      fzf_colors = {
        ["bg"] = { "bg", "FloatBorder" },
        ["bg+"] = { "bg", "FloatBorder" },

        ["fg"] = { "fg", "Comment" },
        ["fg+"] = { "fg", "PreInsert" },

        ["hl"] = { "fg", "Error" },
        ["hl+"] = { "fg", "Error" },
      },
      actions = {
        ["ctrl-h"] = fzf.actions.file_split,
      },
    })

    local builtin_opts = {
      winopts = {
        border = "single",
        preview = {
          border = "single",
        },
        height = 8,
        width = 50,
        row = 0.4,
        col = 0.48,
      },
    }

    local picker_opts = {
      header = false,
      file_icons = "devicons",
      git_icons = false,
      color_icons = true,
    }
    Map("<leader>sa", function()
      fzf.builtin(Merge(builtin_opts, picker_opts))
    end, { desc = "FZF Builtin" })

    Map("<leader><leader>", function()
      fzf.files(Merge(picker_opts, {
        cmd = "rg --files --hidden --ignore --glob='!.git' --sortr=modified",
        fzf_opts = { ["--scheme"] = "path", ["--tiebreak"] = "index" },
      }))
    end, { desc = "Search Files" })

    Map("<leader>sR", function()
      fzf.resume(Merge(picker_opts, { winopts = { width = 0.80 } }))
    end, { desc = "FZF Search Resume" })

    Map("<leader>sg", function()
      fzf.live_grep_native(Merge(picker_opts, {
        winopts = {
          width = 0.80,
          preview = { hidden = false, layout = "horizontal" },
        },
      }))
    end, { desc = "Live Grep" })

    Map("<leader>st", function()
      fzf.colorschemes(Merge(picker_opts, builtin_opts))
    end, { desc = "Switch Theme" })

    Map("<C-e>", function()
      require("fzf-lua.win").toggle_fullscreen()
      require("fzf-lua.win").toggle_preview()
    end, { desc = "Toggle FZF fullscreen" }, { "c", "i", "t" })
  end,
}
