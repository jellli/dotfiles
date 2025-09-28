-- Better text objects.
return {
  {
    "nvim-mini/mini.ai",
    event = "BufReadPre",
    dependencies = "nvim-treesitter/nvim-treesitter-textobjects",
    config = function()
      local ai = require("mini.ai")
      ai.setup({
        n_lines = 300,
        custom_textobjects = {
          o = ai.gen_spec.treesitter({ -- code block
            a = { "@block.outer", "@conditional.outer", "@loop.outer" },
            i = { "@block.inner", "@conditional.inner", "@loop.inner" },
          }),
          f = ai.gen_spec.treesitter({ a = "@function.outer", i = "@function.inner" }, {}),
          c = ai.gen_spec.treesitter({ a = "@class.outer", i = "@class.inner" }), -- class
          t = { "<([%p%w]-)%f[^<%w][^<>]->.-</%1>", "^<.->().*()</[^/]->$" }, -- tags
          -- Whole buffer.
          g = function()
            local from = { line = 1, col = 1 }
            local to = {
              line = vim.fn.line("$"),
              col = math.max(vim.fn.getline("$"):len(), 1),
            }
            return { from = from, to = to }
          end,
        },
        -- Disable error feedback.
        silent = true,
      })
    end,
  },
}
