return {
  {
    "dmtrKovalenko/fff.nvim",
    build = function()
      require("fff.download").download_or_build_binary()
    end,
  },
  {
    "nvim-mini/mini.pick",
    config = function()
      local paste_orig = vim.paste
      local minipick = require("mini.pick")
      minipick.setup({})
      ---@diagnostic disable-next-line: duplicate-set-field
      vim.paste = function(...)
        if not minipick.is_picker_active() then
          return paste_orig(...)
        else
          local reg_contents = vim.fn.getreg("+"):gsub("[\n\t]", " ")
          local char_table = {}
          local len = vim.fn.strchars(reg_contents)

          for i = 0, len - 1 do
            table.insert(char_table, vim.fn.strcharpart(reg_contents, i, 1))
          end
          vim.fn.strchars(reg_contents)
          minipick.set_picker_query(char_table)
        end
      end
      minipick.registry.fff_picker = require("picker.fff").fff_picker
      minipick.registry.buffers_with_diagnostics = require("mini-bonus").buffers.run
    end,
    keys = {
      {
        "<leader><leader>",
        function()
          require("mini.pick").registry.fff_picker()
        end,
        desc = "Search Files",
      },
      {
        "<leader>sR",
        function()
          require("mini.pick").builtin.resume()
        end,
        desc = "Live Grep",
      },
      {
        "<leader>sg",
        function()
          require("mini.pick").builtin.grep_live()
        end,
        desc = "Live Grep",
      },
    },
  },
}
