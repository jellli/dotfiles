local pick = function()
  local refactoring = require("refactoring")
  local results = refactoring.get_refactors()

  require("mini.pick").start({
    source = {
      name = "Refactor",
      items = results,
      choose = function(selected)
        vim.notify(selected)
        refactoring.refactor(selected)
      end,
    },
  })
end
return {
  "ThePrimeagen/refactoring.nvim",
  event = { "BufReadPre", "BufNewFile" },
  dependencies = {
    "nvim-lua/plenary.nvim",
    "nvim-treesitter/nvim-treesitter",
  },
  keys = {
    { "<leader>r", "", desc = "+refactor", mode = { "n", "x" } },
    {
      "<leader>rs",
      pick,
      mode = { "n", "x" },
      desc = "Refactor",
    },
    {
      "<leader>ri",
      function()
        return require("refactoring").refactor("Inline Variable")
      end,
      mode = { "n", "x" },
      desc = "Inline Variable",
      expr = true,
    },
    {
      "<leader>rb",
      function()
        return require("refactoring").refactor("Extract Block")
      end,
      mode = { "n", "x" },
      desc = "Extract Block",
      expr = true,
    },
    {
      "<leader>rf",
      function()
        return require("refactoring").refactor("Extract Block To File")
      end,
      mode = { "n", "x" },
      desc = "Extract Block To File",
      expr = true,
    },
    {
      "<leader>rP",
      function()
        require("refactoring").debug.printf({ below = false })
      end,
      desc = "Debug Print",
    },
    {
      "<leader>rp",
      function()
        require("refactoring").debug.print_var({ normal = true })
      end,
      mode = { "n", "x" },
      desc = "Debug Print Variable",
    },
    {
      "<leader>rc",
      function()
        require("refactoring").debug.cleanup({})
      end,
      desc = "Debug Cleanup",
    },
    {
      "<leader>rf",
      function()
        return require("refactoring").refactor("Extract Function")
      end,
      mode = { "n", "x" },
      desc = "Extract Function",
      expr = true,
    },
    {
      "<leader>rF",
      function()
        return require("refactoring").refactor("Extract Function To File")
      end,
      mode = { "n", "x" },
      desc = "Extract Function To File",
      expr = true,
    },
    {
      "<leader>rx",
      function()
        return require("refactoring").refactor("Extract Variable")
      end,
      mode = { "n", "x" },
      desc = "Extract Variable",
      expr = true,
    },
    {
      "<leader>rp",
      function()
        require("refactoring").debug.print_var()
      end,
      mode = { "n", "x" },
      desc = "Debug Print Variable",
    },
  },
  opts = {
    prompt_func_return_type = {
      go = false,
      java = false,
      cpp = false,
      c = false,
      h = false,
      hpp = false,
      cxx = false,
    },
    prompt_func_param_type = {
      go = false,
      java = false,
      cpp = false,
      c = false,
      h = false,
      hpp = false,
      cxx = false,
    },
    printf_statements = {},
    print_var_statements = {},
    show_success_message = true, -- shows a message with information about the refactor on success
    -- i.e. [Refactor] Inlined 3 variable occurrences
  },
}
