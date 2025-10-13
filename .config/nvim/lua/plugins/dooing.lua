return {
  "atiladefreitas/dooing",
  event = "VeryLazy",
  config = function()
    require("dooing").setup({
      window = {
        border = "single",
        width = 90,
      },
    })
  end,
}
